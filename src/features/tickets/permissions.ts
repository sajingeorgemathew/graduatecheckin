/**
 * Authorization rules for the ticket feature. Ticket management is limited
 * to active administrators. Sensitive operations must call these on a
 * trusted server-side session, never on browser-supplied role values.
 */

import type { StaffSession } from "@/features/auth/types";
import type { StaffRole } from "@/types/database";

/** Administrator only. Supervisors and scanners are always denied. */
export function canManageTickets(role: StaffRole): boolean {
  return role === "administrator";
}

/**
 * True only for an active administrator who has completed any required
 * password change. Anonymous callers, scanners and supervisors never have
 * ticket access.
 */
export function hasTicketAccess(actor: StaffSession | null): boolean {
  return (
    actor !== null &&
    actor.isActive &&
    !actor.mustChangePassword &&
    canManageTickets(actor.role)
  );
}
