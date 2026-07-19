/**
 * Pure dashboard aggregation. Given the eligible registrations and their
 * attendance delta rows, this produces the summary counts and per-category
 * arrived/registered progress. Blocked, failed, cancelled and
 * review-required registrations must be excluded by the caller before the
 * data reaches this module; only eligible registrations are expected here.
 */

import {
  calculateRegistrationAttendance,
  type AttendanceDeltaRow,
  type RegisteredParty,
} from "./calculations";
import type { CategoryProgress } from "./types";

export interface EligibleRegistrationInput {
  registered: RegisteredParty;
  rows: readonly AttendanceDeltaRow[];
}

export interface AttendanceAggregates {
  eligibleRegistrations: number;
  graduatesArrived: number;
  fullyCheckedIn: number;
  partiallyCheckedIn: number;
  notYetArrived: number;
  expectedTotalAttendance: number;
  totalPeopleArrived: number;
  remainingExpectedAttendance: number;
  graduates: CategoryProgress;
  adultGuests: CategoryProgress;
  children0To4: CategoryProgress;
  children5To10: CategoryProgress;
}

export function buildAttendanceAggregates(
  registrations: readonly EligibleRegistrationInput[]
): AttendanceAggregates {
  const aggregates: AttendanceAggregates = {
    eligibleRegistrations: registrations.length,
    graduatesArrived: 0,
    fullyCheckedIn: 0,
    partiallyCheckedIn: 0,
    notYetArrived: 0,
    expectedTotalAttendance: 0,
    totalPeopleArrived: 0,
    remainingExpectedAttendance: 0,
    graduates: { arrived: 0, registered: 0 },
    adultGuests: { arrived: 0, registered: 0 },
    children0To4: { arrived: 0, registered: 0 },
    children5To10: { arrived: 0, registered: 0 },
  };

  for (const registration of registrations) {
    const attendance = calculateRegistrationAttendance(
      registration.rows,
      registration.registered
    );

    aggregates.expectedTotalAttendance += attendance.expectedTotal;
    aggregates.totalPeopleArrived += attendance.arrivedTotal;
    aggregates.remainingExpectedAttendance += attendance.remainingTotal;

    aggregates.graduatesArrived += attendance.arrived.graduate;

    aggregates.graduates.arrived += attendance.arrived.graduate;
    aggregates.graduates.registered += attendance.registered.graduate;
    aggregates.adultGuests.arrived += attendance.arrived.adultGuests;
    aggregates.adultGuests.registered += attendance.registered.adultGuests;
    aggregates.children0To4.arrived += attendance.arrived.children0To4;
    aggregates.children0To4.registered += attendance.registered.children0To4;
    aggregates.children5To10.arrived += attendance.arrived.children5To10;
    aggregates.children5To10.registered += attendance.registered.children5To10;

    if (attendance.classification === "complete") {
      aggregates.fullyCheckedIn += 1;
    } else if (attendance.classification === "partial") {
      aggregates.partiallyCheckedIn += 1;
    } else {
      aggregates.notYetArrived += 1;
    }
  }

  return aggregates;
}
