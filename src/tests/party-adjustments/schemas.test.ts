/**
 * Request validation for an administrator party adjustment. No business
 * maximum applies; counts must be non-negative whole numbers, a reason and an
 * explicit confirmation are required, and names never exceed the adult count.
 */

import { describe, expect, it } from "vitest";

import { partyAdjustmentSchema } from "@/features/party-adjustments/schemas";

const base = {
  registrationId: "11111111-1111-4111-8111-111111111111",
  adultGuestCount: 1,
  adultGuestNames: ["Kwame Osei"],
  children04: 0,
  children510: 0,
  reason: "Paid for one additional guest at the office",
  confirmSameQr: true,
  idempotencyKey: "b7d1f0a4-6c2e-4c1a-9f60-6f5f0a2c9a11",
};

describe("party adjustment request", () => {
  it("accepts a valid adjustment", () => {
    expect(partyAdjustmentSchema.safeParse(base).success).toBe(true);
  });

  it("accepts counts greater than two with no business maximum", () => {
    expect(
      partyAdjustmentSchema.safeParse({
        ...base,
        adultGuestCount: 5,
        adultGuestNames: [],
        children04: 4,
        children510: 3,
      }).success
    ).toBe(true);
  });

  it("rejects fractional and negative counts", () => {
    expect(
      partyAdjustmentSchema.safeParse({ ...base, adultGuestCount: 1.5 }).success
    ).toBe(false);
    expect(
      partyAdjustmentSchema.safeParse({ ...base, children04: -1 }).success
    ).toBe(false);
    expect(
      partyAdjustmentSchema.safeParse({ ...base, children510: 2.2 }).success
    ).toBe(false);
  });

  it("requires a reason of at least five characters", () => {
    expect(
      partyAdjustmentSchema.safeParse({ ...base, reason: "no" }).success
    ).toBe(false);
    expect(
      partyAdjustmentSchema.safeParse({ ...base, reason: "" }).success
    ).toBe(false);
  });

  it("requires the same-QR confirmation", () => {
    expect(
      partyAdjustmentSchema.safeParse({ ...base, confirmSameQr: false }).success
    ).toBe(false);
    const { confirmSameQr: _omit, ...withoutConfirm } = base;
    void _omit;
    expect(partyAdjustmentSchema.safeParse(withoutConfirm).success).toBe(false);
  });

  it("rejects more guest names than the adult guest count", () => {
    expect(
      partyAdjustmentSchema.safeParse({
        ...base,
        adultGuestCount: 1,
        adultGuestNames: ["Kwame Osei", "Nia Osei"],
      }).success
    ).toBe(false);
  });

  it("preserves the unnamed adult guest allowance", () => {
    // Two adult guests, only one named: fewer names than the count is fine.
    expect(
      partyAdjustmentSchema.safeParse({
        ...base,
        adultGuestCount: 2,
        adultGuestNames: ["Kwame Osei"],
      }).success
    ).toBe(true);
  });

  it("requires an idempotency key", () => {
    expect(
      partyAdjustmentSchema.safeParse({ ...base, idempotencyKey: "" }).success
    ).toBe(false);
  });

  it("accepts an optional expected updated_at for optimistic concurrency", () => {
    expect(
      partyAdjustmentSchema.safeParse({
        ...base,
        expectedUpdatedAt: "2026-07-24T00:00:00.000Z",
      }).success
    ).toBe(true);
  });
});
