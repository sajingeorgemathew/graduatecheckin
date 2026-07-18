/**
 * Ticket eligibility rules. A ticket may be generated only for an eligible
 * registration of the configured active event that does not already hold
 * an active ticket. Payment status alone never determines eligibility and
 * a missing email or phone never blocks generation.
 */

import type {
  RegistrationStatus,
  TicketStatus,
} from "@/types/database";

/** Revoked and replaced tickets never count as active. */
export function isTicketActive(status: TicketStatus): boolean {
  return status === "active";
}

export type TicketIneligibilityReason =
  | "registration_not_eligible"
  | "wrong_event"
  | "active_ticket_exists";

export type TicketEligibility =
  | { eligible: true }
  | { eligible: false; reason: TicketIneligibilityReason };

export interface EligibilityCandidate {
  registration_status: RegistrationStatus;
  event_id: string;
}

export function evaluateTicketEligibility(
  registration: EligibilityCandidate,
  activeEventId: string,
  hasActiveTicket: boolean
): TicketEligibility {
  if (registration.event_id !== activeEventId) {
    return { eligible: false, reason: "wrong_event" };
  }
  if (registration.registration_status !== "eligible") {
    return { eligible: false, reason: "registration_not_eligible" };
  }
  if (hasActiveTicket) {
    return { eligible: false, reason: "active_ticket_exists" };
  }
  return { eligible: true };
}
