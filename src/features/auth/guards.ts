import "server-only";

/**
 * Authorization guards. Every protected page, server action and route
 * handler calls one of these itself; the Proxy only provides an early
 * convenience redirect and is never the authorization authority.
 *
 * Guard decisions are computed per request from the verified session and
 * are never cached across users.
 */

import { redirect } from "next/navigation";
import type { StaffRole } from "@/types/database";
import { ACCESS_DENIED_PATH, CHANGE_PASSWORD_PATH, STAFF_HOME_PATH } from "./constants";
import { hasMinimumRole } from "./permissions";
import { loginRedirectPath } from "./redirects";
import { resolveStaffSession } from "./session";
import type { GuardResult, SessionResolution, StaffSession } from "./types";

export interface GuardOptions {
  /** Allow access while a password change is still required. */
  allowPasswordChangeRequired?: boolean;
}

/**
 * Pure guard decision. The message for a missing or inactive profile is
 * identical so responses never reveal which staff accounts exist.
 */
export function evaluateRoleGuard(
  resolution: SessionResolution,
  minimumRole: StaffRole,
  options: GuardOptions = {}
): GuardResult {
  if (resolution.kind === "anonymous") {
    return {
      ok: false,
      status: 401,
      code: "not_authenticated",
      message: "Authentication is required.",
    };
  }
  if (resolution.kind === "no_profile" || resolution.kind === "inactive") {
    return {
      ok: false,
      status: 403,
      code: "account_inactive",
      message: "This account is not authorized.",
    };
  }
  const session = resolution.session;
  if (
    session.mustChangePassword &&
    options.allowPasswordChangeRequired !== true
  ) {
    return {
      ok: false,
      status: 403,
      code: "password_change_required",
      message: "A password change is required before continuing.",
    };
  }
  if (!hasMinimumRole(session.role, minimumRole)) {
    return {
      ok: false,
      status: 403,
      code: "not_authorized",
      message: "This account does not have access to this area.",
    };
  }
  return { ok: true, session };
}

async function requireMinimumRole(
  minimumRole: StaffRole,
  options: GuardOptions = {}
): Promise<GuardResult> {
  const resolution = await resolveStaffSession();
  return evaluateRoleGuard(resolution, minimumRole, options);
}

export async function requireStaffSession(
  options: GuardOptions = {}
): Promise<GuardResult> {
  return requireMinimumRole("scanner", options);
}

export async function requireScanner(): Promise<GuardResult> {
  return requireMinimumRole("scanner");
}

export async function requireSupervisor(): Promise<GuardResult> {
  return requireMinimumRole("supervisor");
}

export async function requireAdministrator(): Promise<GuardResult> {
  return requireMinimumRole("administrator");
}

/**
 * Page-level guard. Redirects instead of returning an error body:
 * anonymous callers go to /login with a safe return path, blocked accounts
 * go to the public access-denied page, staff with a pending required
 * password change go to the change-password page and authenticated staff
 * without the required role land on /staff.
 */
export async function requireStaffPage(
  currentPath: string,
  minimumRole: StaffRole = "scanner",
  options: GuardOptions = {}
): Promise<StaffSession> {
  const guard = await requireMinimumRole(minimumRole, options);
  if (!guard.ok) {
    if (guard.code === "not_authenticated") {
      redirect(loginRedirectPath(currentPath));
    }
    if (guard.code === "account_inactive") {
      redirect(ACCESS_DENIED_PATH);
    }
    if (guard.code === "password_change_required") {
      redirect(CHANGE_PASSWORD_PATH);
    }
    redirect(STAFF_HOME_PATH);
  }
  return guard.session;
}

export async function requireAdministratorPage(
  currentPath: string
): Promise<StaffSession> {
  return requireStaffPage(currentPath, "administrator");
}
