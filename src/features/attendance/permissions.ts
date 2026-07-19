/**
 * Attendance access checks. The dashboard, search, manual arrival,
 * correction and reversal are available to supervisor and administrator
 * roles only; scanner-role users are always denied. Checks run on a trusted
 * server-side session, never on role values supplied by the browser.
 */

import { hasMinimumRole } from "@/features/auth/permissions";
import type { StaffRole } from "@/types/database";

export function canManageAttendance(role: StaffRole): boolean {
  return hasMinimumRole(role, "supervisor");
}
