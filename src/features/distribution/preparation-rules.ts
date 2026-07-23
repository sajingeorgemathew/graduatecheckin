/**
 * Pure delivery-preparation eligibility rules for CHECKIN-09B.
 *
 * A delivery is only ever prepared from a current, valid ticket document
 * belonging to an eligible registration whose recipient email is usable.
 * These rules run before any database write, so an ineligible registration
 * is recorded as an explained exclusion rather than a silent drop. Keeping
 * them pure makes every branch directly testable.
 */

import { isValidEmail } from "./constants";
import type {
  DeliveryExclusionReason,
  DeliveryMode,
  DeliveryPurpose,
} from "./types";

export interface EligibilityRegistration {
  id: string;
  eventId: string;
  registrationStatus: string;
  email: string | null;
}

export interface EligibilityTicket {
  id: string;
  registrationId: string;
  status: string;
}

export interface EligibilityDocument {
  id: string;
  eventId: string;
  registrationId: string;
  ticketId: string;
  status: string;
  templateVersion: number;
  sha256Checksum: string;
}

export interface EligibilityInput {
  mode: DeliveryMode;
  /**
   * CHECKIN-10A: the batch purpose. Only an initial batch excludes graduates
   * who have already been production-sent or recorded as sent externally; a
   * resend or replacement batch deliberately targets exactly those people.
   */
  purpose?: DeliveryPurpose;
  /** A production attempt for this registration has already succeeded. */
  alreadyProductionSent?: boolean;
  /** A prior delivery outside this system has been recorded. */
  previouslySentExternally?: boolean;
  eventId: string;
  eventIsTest: boolean;
  /**
   * Only true when an administrator has explicitly opted into sending from a
   * production event in test mode using the internal test-recipient override.
   */
  allowTestRecipientOverride: boolean;
  currentTemplateVersion: number;
  registration: EligibilityRegistration;
  ticket: EligibilityTicket | null;
  document: EligibilityDocument | null;
  alreadyBatched: boolean;
}

export type EligibilityResult =
  | { ok: true }
  | { ok: false; reason: DeliveryExclusionReason };

const fail = (reason: DeliveryExclusionReason): EligibilityResult => ({
  ok: false,
  reason,
});

/**
 * Evaluates whether one registration may be prepared for delivery. The
 * order of checks is deliberate: mode/event mismatch is fatal to the whole
 * batch intent and is reported first, then per-registration facts.
 */
export function evaluateDeliveryEligibility(
  input: EligibilityInput
): EligibilityResult {
  // Mode must match the event kind. A production send never targets a test
  // event; a test send never targets a production event unless an
  // administrator explicitly enabled the internal test-recipient override.
  if (input.mode === "production" && input.eventIsTest) {
    return fail("mode_event_mismatch");
  }
  if (
    input.mode === "test" &&
    !input.eventIsTest &&
    !input.allowTestRecipientOverride
  ) {
    return fail("mode_event_mismatch");
  }

  const registration = input.registration;
  if (registration.registrationStatus === "cancelled") {
    return fail("registration_cancelled");
  }
  if (registration.registrationStatus !== "eligible") {
    return fail("registration_ineligible");
  }

  const email = (registration.email ?? "").trim();
  if (email.length === 0) {
    return fail("missing_email");
  }
  if (!isValidEmail(email)) {
    return fail("invalid_email");
  }

  const ticket = input.ticket;
  if (ticket === null) {
    return fail("no_active_ticket");
  }
  if (ticket.status === "revoked") {
    return fail("ticket_revoked");
  }
  if (ticket.status === "replaced") {
    return fail("ticket_replaced");
  }
  if (ticket.status !== "active") {
    return fail("no_active_ticket");
  }

  const document = input.document;
  if (document === null) {
    return fail("no_current_document");
  }
  if (document.status === "superseded") {
    return fail("superseded_document");
  }
  if (document.status !== "current") {
    // 'invalidated' or any other non-current status.
    return fail("no_current_document");
  }
  if (document.templateVersion !== input.currentTemplateVersion) {
    return fail("outdated_document");
  }
  if (
    document.eventId !== input.eventId ||
    document.registrationId !== registration.id ||
    document.ticketId !== ticket.id
  ) {
    return fail("document_event_mismatch");
  }
  if (!/^[0-9a-f]{64}$/.test(document.sha256Checksum)) {
    return fail("document_event_mismatch");
  }

  if (input.alreadyBatched) {
    return fail("already_in_delivery_batch");
  }

  // Initial delivery means "has not received this ticket from anyone yet".
  // Both a completed production send and a recorded prior external send take
  // a graduate out of the initial batch; a deliberate resend can still reach
  // them later.
  if ((input.purpose ?? "initial") === "initial") {
    if (input.alreadyProductionSent === true) {
      return fail("already_production_sent");
    }
    if (input.previouslySentExternally === true) {
      return fail("previously_sent_externally");
    }
  }

  return { ok: true };
}
