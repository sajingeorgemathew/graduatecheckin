/**
 * Browser-facing and service types for the scanner feature. The validation
 * view carries only staff-safe display fields. Raw tokens, token hashes,
 * QR payloads, emails, phone numbers, guest names, payment details,
 * internal notes and database UUIDs are never part of any shape here.
 */

import type {
  RegistrationStatus,
  TicketScanMethod,
  TicketStatus,
  TicketValidationResult,
} from "@/types/database";

/**
 * Safe validation response returned to the scanner page. Fields that do
 * not apply to a result are null. validationAttemptId identifies the audit
 * row only and never resolves to ticket or registration data.
 */
export interface ScanValidationView {
  result: TicketValidationResult;
  validationAttemptId: string | null;
  graduateName: string | null;
  ticketCode: string | null;
  ticketStatus: TicketStatus | null;
  registrationStatus: RegistrationStatus | null;
  eventName: string | null;
  eventStartsAt: string | null;
  venueName: string | null;
  registeredAdultGuests: number | null;
  registeredChildren0To4: number | null;
  registeredChildren5To10: number | null;
  expectedPartySize: number | null;
  graduateArrived: number | null;
  adultGuestsArrived: number | null;
  children0To4Arrived: number | null;
  children5To10Arrived: number | null;
  remainingPartySize: number | null;
  latestReplacementTicketCode: string | null;
  latestReplacementStatus: TicketStatus | null;
  validatedAt: string;
}

export interface ScannerStructuredError {
  error: {
    code: string;
    message: string;
  };
}

/**
 * One outcome of the validation service: either a validation view with an
 * HTTP status, or a structured error. Rate-limited scans are views with
 * result rate_limited and status 429.
 */
export type ScanValidationOutcome =
  | { kind: "result"; status: number; view: ScanValidationView }
  | { kind: "error"; status: number; error: ScannerStructuredError };

/** Parsed validation request after Zod validation. */
export interface ScanValidationInput {
  method: TicketScanMethod;
  value: string;
  requestId: string;
}

/** One entry of the in-memory session history on the scanner page. */
export interface RecentValidationEntry {
  key: string;
  time: string;
  result: TicketValidationResult;
  graduateName: string | null;
  ticketCode: string | null;
}
