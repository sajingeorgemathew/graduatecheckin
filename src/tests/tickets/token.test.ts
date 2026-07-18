import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildTicketToken,
  hashTicketToken,
  isTicketUuid,
  MIN_SECRET_ENTROPY_BYTES,
  TicketConfigurationError,
  ticketSecretFingerprint,
  TOKEN_HASH_PATTERN,
  validateTicketSecret,
  verifyTicketToken,
} from "@/features/tickets/token";

// Fictional test secrets only. Never real production values.
const SECRET = randomBytes(48).toString("base64");
const OTHER_SECRET = randomBytes(48).toString("base64");

const TICKET_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_TICKET_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("ticket token service", () => {
  it("is reproducible for the same ticket ID and secret", () => {
    expect(buildTicketToken(TICKET_ID, SECRET)).toBe(
      buildTicketToken(TICKET_ID, SECRET)
    );
  });

  it("produces different tokens for different ticket IDs", () => {
    expect(buildTicketToken(TICKET_ID, SECRET)).not.toBe(
      buildTicketToken(OTHER_TICKET_ID, SECRET)
    );
  });

  it("produces different signatures for different secrets", () => {
    expect(buildTicketToken(TICKET_ID, SECRET)).not.toBe(
      buildTicketToken(TICKET_ID, OTHER_SECRET)
    );
  });

  it("uses the versioned v1.<ticket-id>.<signature> structure", () => {
    const token = buildTicketToken(TICKET_ID, SECRET);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("v1");
    expect(parts[1]).toBe(TICKET_ID);
    expect(parts[2].length).toBeGreaterThan(20);
  });

  it("verifies a valid token", () => {
    const token = buildTicketToken(TICKET_ID, SECRET);
    const result = verifyTicketToken(token, SECRET);
    expect(result).toEqual({ valid: true, ticketId: TICKET_ID });
  });

  it("rejects a modified ticket ID", () => {
    const token = buildTicketToken(TICKET_ID, SECRET);
    const tampered = token.replace(TICKET_ID, OTHER_TICKET_ID);
    const result = verifyTicketToken(tampered, SECRET);
    expect(result.valid).toBe(false);
  });

  it("rejects a modified signature", () => {
    const token = buildTicketToken(TICKET_ID, SECRET);
    const parts = token.split(".");
    const flipped =
      parts[2][0] === "A" ? `B${parts[2].slice(1)}` : `A${parts[2].slice(1)}`;
    const result = verifyTicketToken(`${parts[0]}.${parts[1]}.${flipped}`, SECRET);
    expect(result).toEqual({ valid: false, reason: "invalid_signature" });
  });

  it("rejects a signature created with a different secret", () => {
    const token = buildTicketToken(TICKET_ID, OTHER_SECRET);
    expect(verifyTicketToken(token, SECRET)).toEqual({
      valid: false,
      reason: "invalid_signature",
    });
  });

  it("rejects unknown token versions", () => {
    const token = buildTicketToken(TICKET_ID, SECRET).replace(/^v1/, "v2");
    expect(verifyTicketToken(token, SECRET)).toEqual({
      valid: false,
      reason: "unknown_version",
    });
  });

  it("rejects invalid UUIDs", () => {
    expect(verifyTicketToken("v1.not-a-uuid.c2ln", SECRET)).toEqual({
      valid: false,
      reason: "invalid_ticket_id",
    });
  });

  it("rejects malformed tokens", () => {
    for (const malformed of ["", "v1", "v1.", `v1.${TICKET_ID}`, "a.b.c.d", ".."]) {
      const result = verifyTicketToken(malformed, SECRET);
      expect(result.valid, malformed).toBe(false);
    }
  });

  it("uses constant-time signature comparison", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../features/tickets/token.ts", import.meta.url)
      ),
      "utf8"
    );
    expect(source).toContain("timingSafeEqual");
  });

  it("hashes tokens deterministically as 64 lowercase hex characters", () => {
    const token = buildTicketToken(TICKET_ID, SECRET);
    const hash = hashTicketToken(token);
    expect(hash).toBe(hashTicketToken(token));
    expect(hash).toMatch(TOKEN_HASH_PATTERN);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hash.toLowerCase());
  });

  it("refuses to build tokens without a valid ticket UUID", () => {
    expect(() => buildTicketToken("not-a-uuid", SECRET)).toThrow();
  });

  it("refuses to build tokens with a missing or weak secret", () => {
    expect(() => buildTicketToken(TICKET_ID, "")).toThrow(
      TicketConfigurationError
    );
    expect(() => buildTicketToken(TICKET_ID, "too-short")).toThrow(
      TicketConfigurationError
    );
  });

  it("validates secret entropy without exposing the value", () => {
    expect(validateTicketSecret(undefined)).toEqual({
      configured: false,
      valid: false,
      entropyBytes: 0,
    });
    const weak = validateTicketSecret("short");
    expect(weak.configured).toBe(true);
    expect(weak.valid).toBe(false);
    const strong = validateTicketSecret(SECRET);
    expect(strong.valid).toBe(true);
    expect(strong.entropyBytes).toBeGreaterThanOrEqual(
      MIN_SECRET_ENTROPY_BYTES
    );
  });

  it("produces a short one-way fingerprint that never contains the secret", () => {
    const fingerprint = ticketSecretFingerprint(SECRET);
    expect(fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(SECRET).not.toContain(fingerprint);
  });

  it("recognizes ticket UUIDs case-insensitively at the boundary", () => {
    expect(isTicketUuid(TICKET_ID)).toBe(true);
    expect(isTicketUuid("not-a-uuid")).toBe(false);
  });
});
