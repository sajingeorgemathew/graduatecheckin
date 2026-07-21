/**
 * Shared, runtime-neutral constants for CHECKIN-09B ticket distribution.
 *
 * This module holds no secrets and no database access, so it is safe to
 * import from server routes, CLI scripts and unit tests alike.
 */

export const DISTRIBUTION_SECRET_ENV = "TICKET_DISTRIBUTION_SECRET";

/** Delivery modes. Test deliveries never reach a graduate inbox. */
export const DELIVERY_MODES = ["test", "production"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const DELIVERY_PURPOSES = [
  "initial",
  "updated",
  "replacement",
  "resend",
] as const;
export type DeliveryPurpose = (typeof DELIVERY_PURPOSES)[number];

export const DELIVERY_BATCH_STATUSES = [
  "draft",
  "prepared",
  "sending",
  "partial",
  "completed",
  "failed",
  "cancelled",
] as const;
export type DeliveryBatchStatus = (typeof DELIVERY_BATCH_STATUSES)[number];

export const DELIVERY_STATUSES = [
  "prepared",
  "sent",
  "failed",
  "bounce_detected",
  "resend_required",
  "resent",
  "cancelled",
  "suppressed",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_ATTEMPT_OUTCOMES = [
  "sent",
  "failed",
  "bounce_detected",
  "skipped",
  "cancelled",
] as const;
export type DeliveryAttemptOutcome = (typeof DELIVERY_ATTEMPT_OUTCOMES)[number];

/**
 * Outcomes accepted from an Apps Script results CSV. `test_sent` never marks
 * a production delivery as sent; it is recorded as a test attempt only.
 */
export const RESULT_OUTCOMES = [
  "sent",
  "failed",
  "bounce_detected",
  "skipped",
  "cancelled",
  "test_sent",
] as const;
export type ResultOutcome = (typeof RESULT_OUTCOMES)[number];

export const RESULT_IMPORT_STATUSES = [
  "uploaded",
  "previewed",
  "applied",
  "rejected",
] as const;
export type ResultImportStatus = (typeof RESULT_IMPORT_STATUSES)[number];

/**
 * The production event created by CHECKIN-09B. Deliberately distinct from
 * the GRAD-2026-DEV test event, which is never converted or reused.
 */
export const PRODUCTION_EVENT_CODE = "CONVOCATION-2026";
export const DEV_EVENT_CODE = "GRAD-2026-DEV";

/** Maximum registrations a single delivery batch may cover. */
export const MAX_DELIVERY_BATCH_SIZE = 50;

/** Upper bound on an uploaded results CSV, matching the export ceiling. */
export const MAX_RESULT_CSV_BYTES = 2_000_000;

/** The exact production-send confirmation phrase used in the Google Sheet. */
export const PRODUCTION_CONFIRMATION_PHRASE = "SEND CONVOCATION 2026 TICKETS";

/** The Workspace account authorized to send production tickets. */
export const AUTHORIZED_SENDER_EMAIL = "office@torontoacademy.ca";

/** Email subjects for the three initial send purposes. */
export const EMAIL_SUBJECTS = {
  initial:
    "Your Toronto Academy Convocation Ceremony 2026 Admission Ticket",
  updated:
    "Updated Toronto Academy Convocation Ceremony 2026 Admission Ticket",
  replacement:
    "Replacement Toronto Academy Convocation Ceremony 2026 Admission Ticket",
} as const;

/**
 * A conservative email format check. Distribution never invents addresses;
 * it only rejects clearly unusable ones so a batch cannot be prepared for a
 * recipient that can never receive it.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 && trimmed.length <= 254 && EMAIL_PATTERN.test(trimmed);
}
