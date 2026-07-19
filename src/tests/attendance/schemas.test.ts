import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  correctionSchema,
  manualArrivalSchema,
  reversalSchema,
  searchSchema,
} from "@/features/attendance/schemas";

const REF = "ra1.00000000-0000-4000-8000-0000000000a1.9999999999.signature";

describe("search schema", () => {
  it("accepts the three supported fields", () => {
    for (const field of ["name", "ticket_code", "source_id"] as const) {
      expect(searchSchema.safeParse({ field, term: "ab" }).success).toBe(true);
    }
  });

  it("rejects email and phone search fields", () => {
    expect(searchSchema.safeParse({ field: "email", term: "a@b.c" }).success).toBe(
      false
    );
    expect(
      searchSchema.safeParse({ field: "phone", term: "4160000000" }).success
    ).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(
      searchSchema.safeParse({ field: "name", term: "ab", eventId: "x" }).success
    ).toBe(false);
  });
});

describe("manual arrival schema", () => {
  it("accepts a well-formed body", () => {
    expect(
      manualArrivalSchema.safeParse({
        registrationReference: REF,
        requestId: randomUUID(),
        graduateArriving: 1,
        adultGuestsArriving: 1,
        children0To4Arriving: 0,
        children5To10Arriving: 0,
        reason: "Ticket unavailable",
      }).success
    ).toBe(true);
  });

  it("requires a reason of at least five characters", () => {
    expect(
      manualArrivalSchema.safeParse({
        registrationReference: REF,
        requestId: randomUUID(),
        graduateArriving: 1,
        adultGuestsArriving: 0,
        children0To4Arriving: 0,
        children5To10Arriving: 0,
        reason: "no",
      }).success
    ).toBe(false);
  });

  it("rejects a graduate arriving count above one", () => {
    expect(
      manualArrivalSchema.safeParse({
        registrationReference: REF,
        requestId: randomUUID(),
        graduateArriving: 2,
        adultGuestsArriving: 0,
        children0To4Arriving: 0,
        children5To10Arriving: 0,
        reason: "Ticket unavailable",
      }).success
    ).toBe(false);
  });
});

describe("correction schema", () => {
  it("permits positive and negative deltas within range", () => {
    expect(
      correctionSchema.safeParse({
        registrationReference: REF,
        requestId: randomUUID(),
        graduateDelta: -1,
        adultGuestDelta: 2,
        child0To4Delta: -2,
        child5To10Delta: 0,
        reason: "Wrong count entered",
      }).success
    ).toBe(true);
  });

  it("rejects deltas outside the column range", () => {
    expect(
      correctionSchema.safeParse({
        registrationReference: REF,
        requestId: randomUUID(),
        graduateDelta: 2,
        adultGuestDelta: 0,
        child0To4Delta: 0,
        child5To10Delta: 0,
        reason: "Wrong count entered",
      }).success
    ).toBe(false);
  });
});

describe("reversal schema", () => {
  it("requires an entry reference, request id and reason", () => {
    expect(
      reversalSchema.safeParse({
        entryReference: "en1.00000000-0000-4000-8000-0000000000b1.9999999999.sig",
        requestId: randomUUID(),
        reason: "Recorded in error",
      }).success
    ).toBe(true);
    expect(reversalSchema.safeParse({ reason: "Recorded in error" }).success).toBe(
      false
    );
  });
});
