/**
 * Pure registration-level attendance calculations shared by the dashboard,
 * search and detail views. Attendance always belongs to the registration:
 * every total is summed across all attendance delta rows of the
 * registration, then clamped between zero and the registered allowance, so
 * replacing a ticket never resets or double-counts attendance.
 *
 * These helpers never trust a browser-supplied total. The server calls them
 * with rows it read under the appropriate query; the atomic database
 * functions enforce the same clamping under a registration lock at write
 * time.
 */

/** Attendance classification of one registration. */
export type AttendanceClassification = "not_arrived" | "partial" | "complete";

/** The four attendance delta columns of one graduation_checkins row. */
export interface AttendanceDeltaRow {
  graduate_delta: number;
  adult_guest_delta: number;
  child_0_4_delta: number;
  child_5_10_delta: number;
}

/** Registered allowance of one registration. The graduate is always one. */
export interface RegisteredParty {
  adultGuests: number;
  children0To4: number;
  children5To10: number;
}

/** Clamped per-category attendance of one registration. */
export interface PartyTotals {
  graduate: number;
  adultGuests: number;
  children0To4: number;
  children5To10: number;
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

/** Sums the four delta columns across every row, without clamping. */
export function sumDeltas(rows: readonly AttendanceDeltaRow[]): PartyTotals {
  return rows.reduce<PartyTotals>(
    (totals, row) => ({
      graduate: totals.graduate + row.graduate_delta,
      adultGuests: totals.adultGuests + row.adult_guest_delta,
      children0To4: totals.children0To4 + row.child_0_4_delta,
      children5To10: totals.children5To10 + row.child_5_10_delta,
    }),
    { graduate: 0, adultGuests: 0, children0To4: 0, children5To10: 0 }
  );
}

/**
 * Clamps summed deltas to the registered allowance. The graduate is bounded
 * between zero and one; each guest and child category is bounded between
 * zero and its registered count. Negative correction and reversal deltas are
 * therefore included in the sum and can never push a total below zero.
 */
export function clampArrived(
  raw: PartyTotals,
  registered: RegisteredParty
): PartyTotals {
  return {
    graduate: clamp(raw.graduate, 1),
    adultGuests: clamp(raw.adultGuests, registered.adultGuests),
    children0To4: clamp(raw.children0To4, registered.children0To4),
    children5To10: clamp(raw.children5To10, registered.children5To10),
  };
}

export interface RegistrationAttendance {
  registered: PartyTotals;
  arrived: PartyTotals;
  remaining: PartyTotals;
  expectedTotal: number;
  arrivedTotal: number;
  remainingTotal: number;
  classification: AttendanceClassification;
}

function totalOf(party: PartyTotals): number {
  return (
    party.graduate +
    party.adultGuests +
    party.children0To4 +
    party.children5To10
  );
}

/**
 * Builds the full clamped attendance picture of one registration from its
 * delta rows and registered allowance.
 *
 * A registration is complete only when the graduate and every registered
 * guest and child have arrived. A registration with guests present but the
 * graduate absent is partial, never complete.
 */
export function calculateRegistrationAttendance(
  rows: readonly AttendanceDeltaRow[],
  registered: RegisteredParty
): RegistrationAttendance {
  const arrived = clampArrived(sumDeltas(rows), registered);
  const registeredParty: PartyTotals = {
    graduate: 1,
    adultGuests: registered.adultGuests,
    children0To4: registered.children0To4,
    children5To10: registered.children5To10,
  };
  const remaining: PartyTotals = {
    graduate: registeredParty.graduate - arrived.graduate,
    adultGuests: registeredParty.adultGuests - arrived.adultGuests,
    children0To4: registeredParty.children0To4 - arrived.children0To4,
    children5To10: registeredParty.children5To10 - arrived.children5To10,
  };
  const expectedTotal = totalOf(registeredParty);
  const arrivedTotal = totalOf(arrived);

  let classification: AttendanceClassification;
  if (arrivedTotal === 0) {
    classification = "not_arrived";
  } else if (arrivedTotal >= expectedTotal) {
    classification = "complete";
  } else {
    classification = "partial";
  }

  return {
    registered: registeredParty,
    arrived,
    remaining,
    expectedTotal,
    arrivedTotal,
    remainingTotal: Math.max(expectedTotal - arrivedTotal, 0),
    classification,
  };
}
