/**
 * Browser-facing and service types for the check-in feature. The
 * confirmation view carries only staff-safe display fields: the graduate
 * name, the ticket code, party counts and a safe message. Raw tokens,
 * token hashes, QR payloads, emails, phone numbers, guest names, payment
 * details, internal notes and database UUIDs are never part of any shape
 * here. The validation-attempt id is never echoed back after a successful
 * confirmation.
 */

/**
 * A successful confirmation result, or one of the safe failure results.
 * Every value is safe to display to staff.
 */
export type CheckinResult =
  | "partial"
  | "complete"
  | "already_complete"
  | "validation_expired"
  | "validation_used"
  | "ticket_not_active"
  | "registration_blocked"
  | "wrong_event"
  | "invalid_counts"
  | "allowance_exceeded"
  | "conflict"
  | "unauthorized"
  | "configuration_error";

/** The four arriving-now counts a confirmation records. */
export interface ArrivalSelection {
  graduate: number;
  adultGuests: number;
  children0To4: number;
  children5To10: number;
}

/**
 * Safe confirmation response returned to the scanner page. Fields that do
 * not apply to a result are null. No identifier that could resolve to a
 * registration, ticket or the consumed validation attempt is included.
 */
export interface CheckinConfirmationView {
  result: CheckinResult;
  message: string;
  graduateName: string | null;
  ticketCode: string | null;
  registeredGraduate: number;
  registeredAdultGuests: number | null;
  registeredChildren0To4: number | null;
  registeredChildren5To10: number | null;
  expectedPartySize: number | null;
  graduateArrivedBefore: number | null;
  adultGuestsArrivedBefore: number | null;
  children0To4ArrivedBefore: number | null;
  children5To10ArrivedBefore: number | null;
  graduateArrivingNow: number | null;
  adultGuestsArrivingNow: number | null;
  children0To4ArrivingNow: number | null;
  children5To10ArrivingNow: number | null;
  graduateArrivedTotal: number | null;
  adultGuestsArrivedTotal: number | null;
  children0To4ArrivedTotal: number | null;
  children5To10ArrivedTotal: number | null;
  remainingAdultGuests: number | null;
  remainingChildren0To4: number | null;
  remainingChildren5To10: number | null;
  remainingPartySize: number | null;
  recordedAt: string | null;
}

export interface CheckinStructuredError {
  error: {
    code: string;
    message: string;
  };
}

/**
 * One outcome of the confirmation service: either a confirmation view with
 * an HTTP status, or a structured error for malformed or unauthorized
 * requests.
 */
export type CheckinOutcome =
  | { kind: "result"; status: number; view: CheckinConfirmationView }
  | { kind: "error"; status: number; error: CheckinStructuredError };

/** Parsed confirmation request after Zod validation. */
export interface ConfirmCheckinInput {
  validationAttemptId: string;
  requestId: string;
  graduateArriving: number;
  adultGuestsArriving: number;
  children0To4Arriving: number;
  children5To10Arriving: number;
}
