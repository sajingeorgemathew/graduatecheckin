/**
 * Authorization rule for the import feature. Since CHECKIN-04 the Excel
 * import workflow requires an authenticated, active administrator in every
 * environment. The trusted session is resolved server-side by the auth
 * guards; this module owns the pure decision so it stays unit testable.
 * The development-only ENABLE_DEV_IMPORTS flag has been removed.
 */

import { canImportRegistrations } from "@/features/auth/permissions";
import type { StaffSession } from "@/features/auth/types";

/**
 * True only for an active administrator who has completed any required
 * password change. Anonymous callers, scanners and supervisors never have
 * import access.
 */
export function hasImportAccess(actor: StaffSession | null): boolean {
  return (
    actor !== null &&
    actor.isActive &&
    !actor.mustChangePassword &&
    canImportRegistrations(actor.role)
  );
}
