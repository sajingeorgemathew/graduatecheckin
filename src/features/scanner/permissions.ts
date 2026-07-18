/**
 * Scanner access checks. Scanner validation is available to scanner,
 * supervisor and administrator roles. Checks always run on a trusted
 * server-side session, never on role values supplied by the browser.
 */

import { hasMinimumRole } from "@/features/auth/permissions";
import type { StaffRole } from "@/types/database";

export function canUseScanner(role: StaffRole): boolean {
  return hasMinimumRole(role, "scanner");
}
