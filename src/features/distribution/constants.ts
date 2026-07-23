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

/**
 * CHECKIN-10A safe production run sizes. The pilot is deliberately tiny so a
 * misconfiguration is discovered after five recipients, not two hundred; the
 * normal run is capped so one execution can never empty a whole event.
 */
export const PRODUCTION_PILOT_RUN_SIZE = 5;
export const PRODUCTION_NORMAL_RUN_SIZE = 25;

/** Channels a previously-sent-outside-the-system record may cite. */
export const EXTERNAL_DELIVERY_CHANNELS = [
  "personal_email",
  "office_email",
  "printed_handout",
  "messaging_app",
  "other",
] as const;
export type ExternalDeliveryChannel =
  (typeof EXTERNAL_DELIVERY_CHANNELS)[number];

export const EXTERNAL_DELIVERY_CHANNEL_LABELS: Record<
  ExternalDeliveryChannel,
  string
> = {
  personal_email: "Personal email",
  office_email: "Office email",
  printed_handout: "Printed handout",
  messaging_app: "Messaging app",
  other: "Other",
};

/**
 * The one sentence every distribution surface uses to explain the difference
 * between the two corrective purposes. Kept here so the wording cannot drift
 * between the control centre, the production panel and the runbook.
 */
export const RESEND_VS_REPLACEMENT_TEXT =
  "Resend sends the same valid ticket again. Replacement creates a new ticket and invalidates the old one.";

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
