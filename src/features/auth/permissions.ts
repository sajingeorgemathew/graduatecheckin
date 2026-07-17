/**
 * Reusable role checks built on the explicit hierarchy. Sensitive
 * operations must call these on a trusted server-side session, never on
 * role values supplied by the browser.
 */

import type { StaffRole } from "@/types/database";
import { ROLE_RANK } from "./constants";

export function hasMinimumRole(
  role: StaffRole,
  minimum: StaffRole
): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function canAccessAdmin(role: StaffRole): boolean {
  return role === "administrator";
}

export function canManageStaff(role: StaffRole): boolean {
  return role === "administrator";
}

export function canImportRegistrations(role: StaffRole): boolean {
  return role === "administrator";
}
