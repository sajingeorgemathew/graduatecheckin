/**
 * Shared authentication constants. The role hierarchy is explicit and must
 * never be derived from alphabetical comparison.
 */

import type { StaffRole } from "@/types/database";

/** Explicit role ranking. Higher values include lower capabilities. */
export const ROLE_RANK: Record<StaffRole, number> = {
  scanner: 1,
  supervisor: 2,
  administrator: 3,
};

export const STAFF_ROLES: readonly StaffRole[] = [
  "scanner",
  "supervisor",
  "administrator",
];

export const ROLE_LABELS: Record<StaffRole, string> = {
  scanner: "Scanner",
  supervisor: "Supervisor",
  administrator: "Administrator",
};

/** Landing page for every authorized staff member. */
export const STAFF_HOME_PATH = "/staff";

export const LOGIN_PATH = "/login";

export const CHANGE_PASSWORD_PATH = "/staff/change-password";

export const ACCESS_DENIED_PATH = "/access-denied";

/**
 * The one visible failure message for every sign-in problem. Using a single
 * message never reveals whether a staff email exists.
 */
export const LOGIN_GENERIC_ERROR =
  "Sign in failed. Check your email and password, then try again.";
