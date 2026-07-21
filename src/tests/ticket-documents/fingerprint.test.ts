/**
 * Source fingerprint and stale-document detection. All fixtures are
 * synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  buildFingerprintPayload,
  buildSourceFingerprint,
  sha256Hex,
  shortChecksum,
} from "@/features/ticket-documents/fingerprint";
import type { FingerprintInput } from "@/features/ticket-documents/fingerprint";

import {
  TEST_EVENT,
  TEST_SETTINGS,
  TEST_TICKET_CODE,
  TEST_TICKET_ID,
  TEST_TICKET_ID_2,
  adultGuest,
  makeParty,
} from "./fixtures";

function baseInput(overrides: Partial<FingerprintInput> = {}): FingerprintInput {
  return {
    ticketId: TEST_TICKET_ID,
    ticketStatus: "active",
    ticketCode: TEST_TICKET_CODE,
    party: makeParty(),
    event: TEST_EVENT,
    settings: {
      displayTitle: TEST_SETTINGS.displayTitle,
      description: TEST_SETTINGS.description,
      programSchedule: TEST_SETTINGS.programSchedule,
      primaryLogoAsset: TEST_SETTINGS.primaryLogoAsset,
      secondaryAsset: TEST_SETTINGS.secondaryAsset,
      instructions: TEST_SETTINGS.instructions,
    },
    templateVersion: 1,
    ...overrides,
  };
}

describe("source fingerprint", () => {
  it("is 64 lowercase hexadecimal characters", () => {
    expect(buildSourceFingerprint(baseInput())).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic across repeated calls", () => {
    const first = buildSourceFingerprint(baseInput());
    const second = buildSourceFingerprint(baseInput());
    expect(first).toBe(second);
  });

  it("never mixes in a clock value", () => {
    // Two fingerprints taken at different moments must be identical.
    const first = buildSourceFingerprint(baseInput());
    const payload = buildFingerprintPayload(baseInput());
    expect(payload).not.toMatch(/\d{13}/);
    expect(buildSourceFingerprint(baseInput())).toBe(first);
  });

  it("ignores incidental whitespace", () => {
    const spaced = baseInput({
      party: makeParty({ graduateFullName: "Avery  Testerton" }),
    });
    expect(buildSourceFingerprint(spaced)).toBe(
      buildSourceFingerprint(baseInput())
    );
  });

  it("changes when the ticket identity changes", () => {
    expect(buildSourceFingerprint(baseInput({ ticketId: TEST_TICKET_ID_2 }))).not.toBe(
      buildSourceFingerprint(baseInput())
    );
  });

  it("changes when the ticket status changes", () => {
    expect(
      buildSourceFingerprint(baseInput({ ticketStatus: "revoked" }))
    ).not.toBe(buildSourceFingerprint(baseInput()));
  });

  it("changes when a guest is added", () => {
    const updated = baseInput({
      party: makeParty({ registeredAdultGuests: 1 }, [
        adultGuest("Jordan Sampleford", 1),
      ]),
    });
    expect(buildSourceFingerprint(updated)).not.toBe(
      buildSourceFingerprint(baseInput())
    );
  });

  it("changes when a child count changes", () => {
    const updated = baseInput({
      party: makeParty({ registeredChildren510: 1 }),
    });
    expect(buildSourceFingerprint(updated)).not.toBe(
      buildSourceFingerprint(baseInput())
    );
  });

  it("changes when the guest display order changes", () => {
    const forward = baseInput({
      party: makeParty({ registeredAdultGuests: 2 }, [
        adultGuest("Alpha Guestington", 1),
        adultGuest("Beta Guestington", 2),
      ]),
    });
    const reversed = baseInput({
      party: makeParty({ registeredAdultGuests: 2 }, [
        adultGuest("Beta Guestington", 1),
        adultGuest("Alpha Guestington", 2),
      ]),
    });
    expect(buildSourceFingerprint(forward)).not.toBe(
      buildSourceFingerprint(reversed)
    );
  });

  it("changes when the event venue changes", () => {
    const updated = baseInput({
      event: { ...TEST_EVENT, venueName: "A Different Venue" },
    });
    expect(buildSourceFingerprint(updated)).not.toBe(
      buildSourceFingerprint(baseInput())
    );
  });

  it("changes when the event time changes", () => {
    const updated = baseInput({
      event: { ...TEST_EVENT, startLabel: "1:00 PM" },
    });
    expect(buildSourceFingerprint(updated)).not.toBe(
      buildSourceFingerprint(baseInput())
    );
  });

  it("changes when the program schedule changes", () => {
    const updated = baseInput({
      settings: {
        ...baseInput().settings,
        programSchedule: [
          { startTime: "12:15 PM", endTime: "1:00 PM", title: "Changed" },
        ],
      },
    });
    expect(buildSourceFingerprint(updated)).not.toBe(
      buildSourceFingerprint(baseInput())
    );
  });

  it("changes when the template version changes", () => {
    expect(buildSourceFingerprint(baseInput({ templateVersion: 2 }))).not.toBe(
      buildSourceFingerprint(baseInput())
    );
  });

  it("changes when the logo asset changes", () => {
    const updated = baseInput({
      settings: { ...baseInput().settings, primaryLogoAsset: "other.png" },
    });
    expect(buildSourceFingerprint(updated)).not.toBe(
      buildSourceFingerprint(baseInput())
    );
  });

  it("never includes a secret or token in the payload", () => {
    const payload = buildFingerprintPayload(baseInput());
    expect(payload).not.toContain("secret");
    expect(payload).not.toContain("token");
    expect(payload.toLowerCase()).not.toContain("tae-grad1");
  });
});

describe("checksums", () => {
  it("hashes bytes to 64 lowercase hexadecimal characters", () => {
    expect(sha256Hex(new TextEncoder().encode("sample"))).toMatch(
      /^[0-9a-f]{64}$/
    );
  });

  it("shortens a checksum for display without revealing the whole value", () => {
    const checksum = sha256Hex(new TextEncoder().encode("sample"));
    expect(shortChecksum(checksum)).toHaveLength(12);
    expect(checksum.startsWith(shortChecksum(checksum))).toBe(true);
  });
});
