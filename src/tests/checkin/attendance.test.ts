import { describe, expect, it } from "vitest";

import {
  clampSelection,
  deriveRemaining,
  emptySelection,
  fullRemainingSelection,
  graduateOnlySelection,
  totalArriving,
  type PartyAllowance,
} from "@/features/checkin/attendance";

const FRESH: PartyAllowance = {
  graduateArrived: 0,
  adultGuestsRegistered: 2,
  adultGuestsArrived: 0,
  children0To4Registered: 1,
  children0To4Arrived: 0,
  children5To10Registered: 1,
  children5To10Arrived: 0,
};

const PARTLY: PartyAllowance = {
  graduateArrived: 1,
  adultGuestsRegistered: 2,
  adultGuestsArrived: 1,
  children0To4Registered: 1,
  children0To4Arrived: 0,
  children5To10Registered: 0,
  children5To10Arrived: 0,
};

describe("checkin attendance helpers", () => {
  it("derives remaining from registered minus arrived", () => {
    const remaining = deriveRemaining(PARTLY);
    expect(remaining.graduateAvailable).toBe(false);
    expect(remaining.adultGuests).toBe(1);
    expect(remaining.children0To4).toBe(1);
    expect(remaining.children5To10).toBe(0);
  });

  it("never returns a negative remaining", () => {
    const remaining = deriveRemaining({
      ...FRESH,
      adultGuestsArrived: 5,
    });
    expect(remaining.adultGuests).toBe(0);
  });

  it("clamps a selection to zero and the remaining allowance", () => {
    const remaining = deriveRemaining(FRESH);
    const clamped = clampSelection(
      { graduate: 3, adultGuests: 9, children0To4: 4, children5To10: 4 },
      remaining
    );
    expect(clamped).toEqual({
      graduate: 1,
      adultGuests: 2,
      children0To4: 1,
      children5To10: 1,
    });
  });

  it("forces the graduate to zero once already arrived", () => {
    const remaining = deriveRemaining(PARTLY);
    const clamped = clampSelection(
      { graduate: 1, adultGuests: 0, children0To4: 0, children5To10: 0 },
      remaining
    );
    expect(clamped.graduate).toBe(0);
  });

  it("full remaining party selects everyone not yet arrived", () => {
    const selection = fullRemainingSelection(deriveRemaining(PARTLY));
    expect(selection).toEqual({
      graduate: 0,
      adultGuests: 1,
      children0To4: 1,
      children5To10: 0,
    });
  });

  it("graduate only selects just the graduate when available", () => {
    expect(graduateOnlySelection(deriveRemaining(FRESH))).toEqual({
      graduate: 1,
      adultGuests: 0,
      children0To4: 0,
      children5To10: 0,
    });
    expect(graduateOnlySelection(deriveRemaining(PARTLY)).graduate).toBe(0);
  });

  it("totals every arriving category", () => {
    expect(
      totalArriving({
        graduate: 1,
        adultGuests: 2,
        children0To4: 1,
        children5To10: 0,
      })
    ).toBe(4);
    expect(totalArriving(emptySelection())).toBe(0);
  });
});
