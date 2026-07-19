import { describe, expect, it } from "vitest";

import {
  createEntryReference,
  createRegistrationReference,
  MAX_REFERENCE_LIFETIME_SECONDS,
  verifyEntryReference,
  verifyRegistrationReference,
} from "@/features/attendance/action-token";
import { EVENT_CODE, REGISTRATION_ID, TEST_SECRET } from "./helpers";

const OTHER_EVENT = "GRAD-2026-OTHER";

describe("signed registration references", () => {
  it("round-trips a valid reference and never contains the raw UUID plainly", () => {
    const reference = createRegistrationReference(
      REGISTRATION_ID,
      EVENT_CODE,
      TEST_SECRET
    );
    const verified = verifyRegistrationReference(
      reference,
      EVENT_CODE,
      TEST_SECRET
    );
    expect(verified).toEqual({ valid: true, id: REGISTRATION_ID });
    // It is a compact signed string and never contains the raw UUID.
    expect(reference.startsWith("ra1.")).toBe(true);
    expect(reference).not.toContain(REGISTRATION_ID);
  });

  it("rejects a reference signed for a different event", () => {
    const reference = createRegistrationReference(
      REGISTRATION_ID,
      EVENT_CODE,
      TEST_SECRET
    );
    const verified = verifyRegistrationReference(
      reference,
      OTHER_EVENT,
      TEST_SECRET
    );
    expect(verified.valid).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const reference = createRegistrationReference(
      REGISTRATION_ID,
      EVENT_CODE,
      TEST_SECRET
    );
    const tampered = `${reference.slice(0, -2)}xx`;
    const verified = verifyRegistrationReference(
      tampered,
      EVENT_CODE,
      TEST_SECRET
    );
    expect(verified.valid).toBe(false);
  });

  it("rejects an expired reference with the expired reason", () => {
    const past = Date.now() - (MAX_REFERENCE_LIFETIME_SECONDS + 60) * 1000;
    const reference = createRegistrationReference(
      REGISTRATION_ID,
      EVENT_CODE,
      TEST_SECRET,
      { now: past }
    );
    const verified = verifyRegistrationReference(
      reference,
      EVENT_CODE,
      TEST_SECRET
    );
    expect(verified).toEqual({ valid: false, reason: "expired" });
  });

  it("clamps the lifetime to at most fifteen minutes", () => {
    const now = 1_000_000_000_000;
    const reference = createRegistrationReference(
      REGISTRATION_ID,
      EVENT_CODE,
      TEST_SECRET,
      { ttlSeconds: 60 * 60, now }
    );
    const expiry = Number.parseInt(reference.split(".")[2], 10);
    expect(expiry).toBe(
      Math.floor(now / 1000) + MAX_REFERENCE_LIFETIME_SECONDS
    );
  });

  it("rejects a malformed reference generically", () => {
    expect(
      verifyRegistrationReference("not-a-reference", EVENT_CODE, TEST_SECRET)
    ).toEqual({ valid: false, reason: "invalid" });
  });
});

describe("signed entry references", () => {
  it("does not accept an entry reference as a registration reference", () => {
    const entry = createEntryReference(REGISTRATION_ID, EVENT_CODE, TEST_SECRET);
    expect(
      verifyRegistrationReference(entry, EVENT_CODE, TEST_SECRET).valid
    ).toBe(false);
    expect(verifyEntryReference(entry, EVENT_CODE, TEST_SECRET)).toEqual({
      valid: true,
      id: REGISTRATION_ID,
    });
  });
});
