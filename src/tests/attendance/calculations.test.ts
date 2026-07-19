import { describe, expect, it } from "vitest";

import {
  calculateRegistrationAttendance,
  clampArrived,
  sumDeltas,
  type AttendanceDeltaRow,
  type RegisteredParty,
} from "@/features/attendance/calculations";
import { buildAttendanceAggregates } from "@/features/attendance/summaries";

const FULL_PARTY: RegisteredParty = {
  adultGuests: 2,
  children0To4: 1,
  children5To10: 1,
};

function row(overrides: Partial<AttendanceDeltaRow> = {}): AttendanceDeltaRow {
  return {
    graduate_delta: 0,
    adult_guest_delta: 0,
    child_0_4_delta: 0,
    child_5_10_delta: 0,
    ...overrides,
  };
}

describe("registration-level attendance", () => {
  it("classifies a registration with no rows as not arrived", () => {
    const attendance = calculateRegistrationAttendance([], FULL_PARTY);
    expect(attendance.classification).toBe("not_arrived");
    expect(attendance.arrivedTotal).toBe(0);
    expect(attendance.expectedTotal).toBe(5);
    expect(attendance.remainingTotal).toBe(5);
  });

  it("classifies a guest-first arrival without the graduate as partial", () => {
    const attendance = calculateRegistrationAttendance(
      [row({ adult_guest_delta: 1 })],
      FULL_PARTY
    );
    expect(attendance.classification).toBe("partial");
    expect(attendance.arrived.graduate).toBe(0);
    expect(attendance.arrived.adultGuests).toBe(1);
  });

  it("classifies the full registered party as complete", () => {
    const attendance = calculateRegistrationAttendance(
      [
        row({
          graduate_delta: 1,
          adult_guest_delta: 2,
          child_0_4_delta: 1,
          child_5_10_delta: 1,
        }),
      ],
      FULL_PARTY
    );
    expect(attendance.classification).toBe("complete");
    expect(attendance.remainingTotal).toBe(0);
  });

  it("clamps the graduate between zero and one", () => {
    const clamped = clampArrived(
      sumDeltas([row({ graduate_delta: 1 }), row({ graduate_delta: 1 })]),
      FULL_PARTY
    );
    expect(clamped.graduate).toBe(1);
  });

  it("clamps guest counts to the registered allowance", () => {
    const clamped = clampArrived(
      sumDeltas([row({ adult_guest_delta: 2 }), row({ adult_guest_delta: 2 })]),
      FULL_PARTY
    );
    expect(clamped.adultGuests).toBe(2);
  });

  it("includes negative correction and reversal deltas without going below zero", () => {
    const attendance = calculateRegistrationAttendance(
      [row({ adult_guest_delta: 2 }), row({ adult_guest_delta: -1 })],
      FULL_PARTY
    );
    expect(attendance.arrived.adultGuests).toBe(1);
  });

  it("counts a replacement-ticket registration once by summing every row", () => {
    // Two rows recorded under different tickets of the same registration.
    const attendance = calculateRegistrationAttendance(
      [
        row({ graduate_delta: 1 }),
        row({ adult_guest_delta: 2, child_0_4_delta: 1, child_5_10_delta: 1 }),
      ],
      FULL_PARTY
    );
    expect(attendance.arrived.graduate).toBe(1);
    expect(attendance.arrived.adultGuests).toBe(2);
    expect(attendance.classification).toBe("complete");
  });
});

describe("dashboard aggregates", () => {
  it("sums expected, arrived and remaining across eligible registrations", () => {
    const aggregates = buildAttendanceAggregates([
      { registered: FULL_PARTY, rows: [row({ graduate_delta: 1 })] },
      {
        registered: { adultGuests: 1, children0To4: 0, children5To10: 0 },
        rows: [],
      },
    ]);
    expect(aggregates.eligibleRegistrations).toBe(2);
    expect(aggregates.expectedTotalAttendance).toBe(5 + 2);
    expect(aggregates.totalPeopleArrived).toBe(1);
    expect(aggregates.remainingExpectedAttendance).toBe(6);
    expect(aggregates.graduatesArrived).toBe(1);
  });

  it("tracks fully, partially and not-arrived counts", () => {
    const aggregates = buildAttendanceAggregates([
      {
        registered: FULL_PARTY,
        rows: [
          row({
            graduate_delta: 1,
            adult_guest_delta: 2,
            child_0_4_delta: 1,
            child_5_10_delta: 1,
          }),
        ],
      },
      { registered: FULL_PARTY, rows: [row({ adult_guest_delta: 1 })] },
      { registered: FULL_PARTY, rows: [] },
    ]);
    expect(aggregates.fullyCheckedIn).toBe(1);
    expect(aggregates.partiallyCheckedIn).toBe(1);
    expect(aggregates.notYetArrived).toBe(1);
  });

  it("reports category arrived out of registered", () => {
    const aggregates = buildAttendanceAggregates([
      { registered: FULL_PARTY, rows: [row({ adult_guest_delta: 1 })] },
    ]);
    expect(aggregates.adultGuests).toEqual({ arrived: 1, registered: 2 });
    expect(aggregates.graduates).toEqual({ arrived: 0, registered: 1 });
  });
});
