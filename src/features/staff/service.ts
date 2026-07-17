import "server-only";

/**
 * Staff administration workflows. Route handlers stay thin and delegate
 * here with the trusted acting session. Every function re-verifies that
 * the actor is an active administrator, so no mutation ever relies on the
 * Proxy or client-side checks alone.
 *
 * Temporary passwords are generated here, returned exactly once in the
 * in-flight response and never stored, logged or written to audit values.
 */

import { canManageStaff } from "@/features/auth/permissions";
import { generateTemporaryPassword } from "@/features/auth/temporary-password";
import type { StaffSession } from "@/features/auth/types";
import type { Json, StaffProfileRow, StaffRole } from "@/types/database";
import { changeRoleSchema, createStaffSchema, setActiveSchema } from "./schemas";
import type { StaffServiceDeps } from "./repository";
import type {
  CreatedStaffAccount,
  StaffServiceResult,
  StaffStructuredError,
  TemporaryPasswordReset,
} from "./types";

function failure<T>(
  status: number,
  code: string,
  message: string
): StaffServiceResult<T> {
  const error: StaffStructuredError = { error: { code, message } };
  return { ok: false, status, error };
}

function actorFailure<T>(): StaffServiceResult<T> {
  return failure(403, "not_authorized", "Administrator access is required.");
}

function isAuthorizedActor(actor: StaffSession): boolean {
  return actor.isActive && !actor.mustChangePassword && canManageStaff(actor.role);
}

/** Parses the JSON returned by the apply_staff_access_change function. */
export function parseAccessChangeResult(json: Json):
  | { ok: true }
  | { ok: false; code: string } {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, code: "unexpected_result" };
  }
  if (json.ok === true) {
    return { ok: true };
  }
  const code = typeof json.code === "string" ? json.code : "unexpected_result";
  return { ok: false, code };
}

function accessChangeFailure<T>(code: string): StaffServiceResult<T> {
  switch (code) {
    case "staff_not_found":
      return failure(404, code, "The staff account was not found.");
    case "self_deactivation_blocked":
      return failure(409, code, "You cannot deactivate your own account.");
    case "self_demotion_blocked":
      return failure(409, code, "You cannot remove your own administrator role.");
    case "final_administrator_protected":
      return failure(
        409,
        code,
        "This change would remove the final active administrator and is blocked."
      );
    default:
      return failure(500, "access_change_failed", "The staff change failed.");
  }
}

/**
 * Creates a staff account: a confirmed Auth user with a cryptographically
 * generated temporary password plus the staff profile. If the profile
 * insert fails the new Auth user is deleted so no unapproved account is
 * left behind.
 */
export async function createStaffAccount(
  deps: StaffServiceDeps,
  actor: StaffSession,
  input: unknown
): Promise<StaffServiceResult<CreatedStaffAccount>> {
  if (!isAuthorizedActor(actor)) {
    return actorFailure();
  }

  const parsed = createStaffSchema.safeParse(input);
  if (!parsed.success) {
    return failure(
      422,
      "invalid_staff_input",
      "Provide a valid email, display name and role."
    );
  }
  const { email, displayName, role } = parsed.data;

  const existing = await deps.findStaffProfileByEmail(email);
  if (existing !== null) {
    return failure(
      409,
      "staff_email_exists",
      "A staff account with this email already exists."
    );
  }

  const temporaryPassword = generateTemporaryPassword();

  const created = await deps.createAuthUser(email, temporaryPassword);
  if (!created.ok) {
    if (created.code === "email_exists") {
      return failure(
        409,
        "staff_email_exists",
        "A staff account with this email already exists."
      );
    }
    return failure(500, "staff_create_failed", "The staff account could not be created.");
  }

  try {
    await deps.insertStaffProfile({
      user_id: created.userId,
      display_name: displayName,
      role,
      is_active: true,
      email_snapshot: email,
      must_change_password: true,
      created_by: actor.userId,
      updated_by: actor.userId,
    });
  } catch {
    // Never leave an Auth user behind without an approved staff profile.
    await deps.deleteAuthUser(created.userId);
    return failure(500, "staff_create_failed", "The staff account could not be created.");
  }

  await deps.writeAudit({
    actorUserId: actor.userId,
    targetUserId: created.userId,
    action: "staff_created",
    newValues: {
      display_name: displayName,
      role,
      is_active: true,
      must_change_password: true,
    },
  });

  return {
    ok: true,
    data: {
      userId: created.userId,
      email,
      displayName,
      role,
      temporaryPassword,
    },
  };
}

async function loadTarget(
  deps: StaffServiceDeps,
  targetUserId: string
): Promise<StaffProfileRow | null> {
  return deps.getStaffProfile(targetUserId);
}

export async function changeStaffRole(
  deps: StaffServiceDeps,
  actor: StaffSession,
  targetUserId: string,
  input: unknown
): Promise<StaffServiceResult<{ role: StaffRole }>> {
  if (!isAuthorizedActor(actor)) {
    return actorFailure();
  }
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) {
    return failure(422, "invalid_role", "Choose a valid staff role.");
  }

  const target = await loadTarget(deps, targetUserId);
  if (target === null) {
    return failure(404, "staff_not_found", "The staff account was not found.");
  }
  if (target.role === parsed.data.role) {
    return failure(409, "role_unchanged", "The staff member already has this role.");
  }

  const result = parseAccessChangeResult(
    await deps.applyAccessChange(
      actor.userId,
      targetUserId,
      parsed.data.role,
      target.is_active
    )
  );
  if (!result.ok) {
    return accessChangeFailure(result.code);
  }

  await deps.writeAudit({
    actorUserId: actor.userId,
    targetUserId,
    action: "role_changed",
    previousValues: { role: target.role },
    newValues: { role: parsed.data.role },
  });

  return { ok: true, data: { role: parsed.data.role } };
}

export async function setStaffActive(
  deps: StaffServiceDeps,
  actor: StaffSession,
  targetUserId: string,
  input: unknown
): Promise<StaffServiceResult<{ active: boolean }>> {
  if (!isAuthorizedActor(actor)) {
    return actorFailure();
  }
  const parsed = setActiveSchema.safeParse(input);
  if (!parsed.success) {
    return failure(422, "invalid_status", "Provide the requested active status.");
  }

  const target = await loadTarget(deps, targetUserId);
  if (target === null) {
    return failure(404, "staff_not_found", "The staff account was not found.");
  }
  if (target.is_active === parsed.data.active) {
    return failure(
      409,
      "status_unchanged",
      parsed.data.active
        ? "The staff member is already active."
        : "The staff member is already inactive."
    );
  }

  const result = parseAccessChangeResult(
    await deps.applyAccessChange(
      actor.userId,
      targetUserId,
      target.role,
      parsed.data.active
    )
  );
  if (!result.ok) {
    return accessChangeFailure(result.code);
  }

  await deps.writeAudit({
    actorUserId: actor.userId,
    targetUserId,
    action: parsed.data.active ? "staff_activated" : "staff_deactivated",
    previousValues: { is_active: target.is_active, role: target.role },
    newValues: { is_active: parsed.data.active, role: target.role },
  });

  return { ok: true, data: { active: parsed.data.active } };
}

/**
 * Resets a staff member's password to a new temporary value. The new
 * password is returned exactly once and never stored or audited.
 */
export async function resetStaffTemporaryPassword(
  deps: StaffServiceDeps,
  actor: StaffSession,
  targetUserId: string
): Promise<StaffServiceResult<TemporaryPasswordReset>> {
  if (!isAuthorizedActor(actor)) {
    return actorFailure();
  }

  const target = await loadTarget(deps, targetUserId);
  if (target === null) {
    return failure(404, "staff_not_found", "The staff account was not found.");
  }

  const temporaryPassword = generateTemporaryPassword();
  const updated = await deps.updateAuthUserPassword(targetUserId, temporaryPassword);
  if (!updated) {
    return failure(500, "password_reset_failed", "The password reset failed.");
  }

  await deps.setMustChangePassword(targetUserId, true, actor.userId);
  await deps.writeAudit({
    actorUserId: actor.userId,
    targetUserId,
    action: "temporary_password_reset",
    newValues: { must_change_password: true },
  });

  return {
    ok: true,
    data: {
      userId: targetUserId,
      email: target.email_snapshot,
      temporaryPassword,
    },
  };
}
