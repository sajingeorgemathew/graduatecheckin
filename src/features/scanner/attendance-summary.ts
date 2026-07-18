/**
 * Registration-level attendance calculation.
 *
 * Attendance always belongs to the registration, never to one ticket.
 * Totals are cumulative sums of the delta columns across every
 * graduation_checkins row of the registration, including corrections and
 * reversals, so replacing a ticket can never reset attendance: the new
 * ticket resolves to the same registration and therefore to the same
 * check-in history.
 *
 * Displayed totals are clamped between zero and the registered allowance
 * so damaged data can never show negative or impossible counts.
 */

export interface RegisteredParty {
  adultGuests: number;
  children0To4: number;
  children5To10: number;
}

export interface CheckinDeltaRow {
  graduate_delta: number;
  adult_guest_delta: number;
  child_0_4_delta: number;
  child_5_10_delta: number;
}

export type AttendanceState = "none" | "partial" | "full";

export interface AttendanceSummary {
  graduateArrived: number;
  adultGuestsArrived: number;
  children0To4Arrived: number;
  children5To10Arrived: number;
  expectedPartySize: number;
  arrivedTotal: number;
  remainingPartySize: number;
  state: AttendanceState;
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

export function summarizeAttendance(
  party: RegisteredParty,
  checkins: readonly CheckinDeltaRow[]
): AttendanceSummary {
  let graduate = 0;
  let adults = 0;
  let children0To4 = 0;
  let children5To10 = 0;
  for (const row of checkins) {
    graduate += row.graduate_delta;
    adults += row.adult_guest_delta;
    children0To4 += row.child_0_4_delta;
    children5To10 += row.child_5_10_delta;
  }

  const graduateArrived = clamp(graduate, 1);
  const adultGuestsArrived = clamp(adults, party.adultGuests);
  const children0To4Arrived = clamp(children0To4, party.children0To4);
  const children5To10Arrived = clamp(children5To10, party.children5To10);

  const expectedPartySize =
    1 + party.adultGuests + party.children0To4 + party.children5To10;
  const arrivedTotal =
    graduateArrived +
    adultGuestsArrived +
    children0To4Arrived +
    children5To10Arrived;
  const remainingPartySize = Math.max(expectedPartySize - arrivedTotal, 0);

  let state: AttendanceState = "partial";
  if (arrivedTotal === 0) {
    state = "none";
  } else if (arrivedTotal >= expectedPartySize) {
    state = "full";
  }

  return {
    graduateArrived,
    adultGuestsArrived,
    children0To4Arrived,
    children5To10Arrived,
    expectedPartySize,
    arrivedTotal,
    remainingPartySize,
    state,
  };
}
