/**
 * Shared constants for the Manual Delivery Desk. Safe to import from both
 * server and client code. Must never contain secrets.
 *
 * This release sends no email. The application prepares a personalized,
 * branded message the administrator pastes into Gmail, and records the send
 * only after the administrator confirms it happened.
 */

/** The provider recorded on every manual delivery attempt. */
export const MANUAL_DELIVERY_PROVIDER = "manual-gmail";

/**
 * The Toronto Academy logo used in the email. taelogo.png is the preferred
 * source; the resolver falls back to the committed lockup when it is
 * absent, exactly as the PDF renderer does.
 */
export const PREFERRED_EMAIL_LOGO_ASSET = "taelogo.png";
export const FALLBACK_EMAIL_LOGO_ASSET = "logo_final_full.png";

/**
 * Gmail cannot fetch an image from the administrator's laptop, so a pasted
 * email must reference an absolute production URL. These hosts are treated
 * as development-only and never used to build a logo URL.
 */
export const NON_PRODUCTION_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
] as const;

export const EMAIL_SUBJECT_PREFIX =
  "Your Toronto Academy Convocation Ceremony 2026 Admission Ticket";

export const RESEND_SUBJECT_PREFIX =
  "Resending: Toronto Academy Convocation Ceremony 2026 Admission Ticket";

export const REPLACEMENT_SUBJECT_PREFIX =
  "Replacement Toronto Academy Convocation Ceremony 2026 Admission Ticket";

/** Filters offered on the desk. */
export const MANUAL_DELIVERY_FILTERS = [
  "all",
  "ready_to_send",
  "ticket_missing",
  "manually_sent",
  "resent",
  "email_missing",
  "needs_reconciliation",
  "checked_in",
  "not_checked_in",
] as const;

export type ManualDeliveryFilter = (typeof MANUAL_DELIVERY_FILTERS)[number];

export const MANUAL_DELIVERY_FILTER_LABELS: Record<
  ManualDeliveryFilter,
  string
> = {
  all: "All",
  ready_to_send: "Ready to send",
  ticket_missing: "Ticket missing",
  manually_sent: "Manually sent",
  resent: "Resent",
  email_missing: "Email missing",
  needs_reconciliation: "Needs reconciliation",
  checked_in: "Checked in",
  not_checked_in: "Not checked in",
};

/** Minimum length of the reason required for a resend or a replacement. */
export const MIN_REASON_LENGTH = 5;
export const MAX_REASON_LENGTH = 500;

/**
 * Guidance shown in every ticket email.
 *
 * The wording must match how check-in actually works: one active ticket
 * covers one registration and its whole approved party, and the same
 * ticket is presented again when party members arrive later. Any claim
 * that the ticket is scanned once and admits the party together would be
 * wrong, so the sections below are the single source for both the HTML
 * and the plain-text rendering.
 */
export interface EmailGuidanceSection {
  heading: string;
  body: string;
}

export const EMAIL_GUIDANCE_SECTIONS: readonly EmailGuidanceSection[] = [
  {
    heading: "One ticket for your registered party",
    body:
      "This single ticket covers you and everyone included in your " +
      "confirmed registration. Separate tickets are not required for your " +
      "guests or children.",
  },
  {
    heading: "Arriving at different times",
    body:
      "Members of your registered party may arrive at different times. " +
      "Present the same ticket whenever another registered member of your " +
      "party arrives. Our check-in team will record only the people " +
      "arriving at that time, and the ticket will remain usable until your " +
      "complete registered party has checked in.",
  },
  {
    heading: "QR code privacy",
    body:
      "The QR code does not encode your name, email address, phone number, " +
      "guest details or payment information. It is not a public website " +
      "link and can only be validated through the Toronto Academy check-in " +
      "system for this convocation.",
  },
  {
    heading: "Arrival time",
    body:
      "Please arrive at 12:00 PM sharp. Seating is being arranged based on " +
      "confirmed registrations, so graduates and their registered parties " +
      "are requested to be on time. Members of your party may still arrive " +
      "separately. Present the same ticket whenever another registered " +
      "member of your party arrives. You may present the attached ticket " +
      "on your phone or bring a printed copy.",
  },
] as const;

export const ATTACHMENT_INSTRUCTION_PREFIX = "Attach this file:";
