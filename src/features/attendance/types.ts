/**
 * Browser-facing and service types for the attendance feature. Every view
 * carries only staff-safe display fields: the graduate name, attendance
 * counts, entry classifications, a staff display name and a short reason.
 * Emails, phone numbers, guest names, payment values, internal notes, raw
 * tokens, token hashes, QR payloads and database UUIDs are never part of any
 * shape here. Registrations and reversible entries are addressed only by
 * short-lived signed references.
 */

import type { AttendanceEntryKind } from "@/types/database";
import type {
  AttendanceClassification,
  PartyTotals,
} from "./calculations";

export type { AttendanceClassification, PartyTotals };

/** One category shown as arrived out of registered. */
export interface CategoryProgress {
  arrived: number;
  registered: number;
}

/** Aggregate dashboard summary. Counts only; never any personal field. */
export interface AttendanceSummaryView {
  generatedAt: string;
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
  recentActivity: AttendanceActivityEntry[];
}

/** One recent attendance activity row. Reason is included only because the
 * summary endpoint is supervisor-only; scanner users never reach it. */
export interface AttendanceActivityEntry {
  occurredAt: string;
  graduateName: string;
  entryKind: AttendanceEntryKind;
  graduateDelta: number;
  adultGuestDelta: number;
  child0To4Delta: number;
  child5To10Delta: number;
  recordedByName: string;
  reason: string | null;
}

/** One manual-search result. The registration is addressed only by a
 * short-lived signed reference; its UUID is never returned. */
export interface AttendanceSearchResult {
  registrationReference: string;
  graduateName: string;
  registrationStatus: string;
  ticketStatus: string | null;
  registered: PartyTotals;
  arrived: PartyTotals;
  remaining: PartyTotals;
  classification: AttendanceClassification;
}

export interface AttendanceSearchView {
  results: AttendanceSearchResult[];
  /** Total matches after filters, which may exceed the returned results. */
  matched: number;
  truncated: boolean;
}

/** One entry in a registration attendance history. A reversible entry
 * carries a short-lived signed entry reference; no UUID is ever exposed. */
export interface AttendanceHistoryEntry {
  entryReference: string | null;
  occurredAt: string;
  entryKind: AttendanceEntryKind;
  graduateDelta: number;
  adultGuestDelta: number;
  child0To4Delta: number;
  child5To10Delta: number;
  recordedByName: string;
  reason: string | null;
  reversed: boolean;
  isReversal: boolean;
}

export interface AttendanceDetailView {
  registrationReference: string;
  graduateName: string;
  registrationStatus: string;
  ticketStatus: string | null;
  registered: PartyTotals;
  arrived: PartyTotals;
  remaining: PartyTotals;
  classification: AttendanceClassification;
  history: AttendanceHistoryEntry[];
}

/** Safe result of a manual arrival, correction or reversal. */
export interface AttendanceWriteView {
  graduateName: string | null;
  registered: PartyTotals;
  arrived: PartyTotals;
  remaining: PartyTotals;
  classification: AttendanceClassification;
}

export interface AttendanceStructuredError {
  error: {
    code: string;
    message: string;
  };
}

/** One outcome of a service call: a typed view with a status, or an error. */
export type AttendanceOutcome<TView> =
  | { kind: "result"; status: number; view: TView }
  | { kind: "error"; status: number; error: AttendanceStructuredError };
