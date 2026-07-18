import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildQrPayload,
  parseQrPayload,
  QR_PAYLOAD_PREFIX,
} from "@/features/tickets/qr-payload";
import { buildTicketToken } from "@/features/tickets/token";

const SECRET = randomBytes(48).toString("base64");
const TICKET_ID = "11111111-2222-4333-8444-555555555555";

describe("qr payload", () => {
  it("uses the versioned TAE-GRAD1: prefix", () => {
    expect(QR_PAYLOAD_PREFIX).toBe("TAE-GRAD1:");
    const payload = buildQrPayload("v1.token.sig");
    expect(payload.startsWith("TAE-GRAD1:")).toBe(true);
  });

  it("round-trips a valid token", () => {
    const token = buildTicketToken(TICKET_ID, SECRET);
    const parsed = parseQrPayload(buildQrPayload(token));
    expect(parsed).toEqual({ ok: true, token });
  });

  it("rejects unknown prefixes", () => {
    expect(parseQrPayload("OTHER-APP:v1.a.b")).toEqual({
      ok: false,
      reason: "unknown_prefix",
    });
    expect(parseQrPayload("https://example.com/ticket")).toEqual({
      ok: false,
      reason: "unknown_prefix",
    });
  });

  it("rejects blank payloads", () => {
    expect(parseQrPayload("")).toEqual({ ok: false, reason: "blank" });
    expect(parseQrPayload("   ")).toEqual({ ok: false, reason: "blank" });
  });

  it("rejects a prefix without a token", () => {
    expect(parseQrPayload("TAE-GRAD1:")).toEqual({
      ok: false,
      reason: "empty_token",
    });
  });

  it("is not an HTTP URL and contains no personal information", () => {
    const token = buildTicketToken(TICKET_ID, SECRET);
    const payload = buildQrPayload(token);
    expect(payload.startsWith("http")).toBe(false);
    expect(payload).not.toContain("@");
    expect(payload.toLowerCase()).not.toContain("name");
    expect(payload.toLowerCase()).not.toContain("email");
    expect(payload.toLowerCase()).not.toContain("phone");
  });
});
