import "server-only";

/**
 * Authentication flows for the login and change-password server actions.
 * Every failure that could reveal whether a staff email exists returns the
 * same generic message. Passwords are used transiently and never logged,
 * stored or included in audit values.
 */

import { writeStaffAuditEvent } from "@/features/staff/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LOGIN_GENERIC_ERROR, STAFF_HOME_PATH } from "./constants";
import { clearMustChangePassword, getStaffProfileByUserId, recordSuccessfulLogin } from "./repository";
import { loginDestination } from "./redirects";
import { changePasswordSchema, loginSchema } from "./schemas";
import type { StaffSession } from "./types";

export type AuthActionResult =
  | { ok: true; redirectTo: string }
  | { ok: false; message: string };

/**
 * Signs a staff member in with email and password. Invalid email, invalid
 * password, missing profile and inactive profile all return the identical
 * generic error. A blocked sign-in is audited and signed out immediately.
 */
export async function performLogin(rawInput: {
  email: unknown;
  password: unknown;
  next: unknown;
}): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse({
    email: rawInput.email,
    password: rawInput.password,
    next: typeof rawInput.next === "string" ? rawInput.next : undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: LOGIN_GENERIC_ERROR };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error !== null || data.user === null) {
    return { ok: false, message: LOGIN_GENERIC_ERROR };
  }

  const profile = await getStaffProfileByUserId(data.user.id);
  if (profile === null || !profile.is_active) {
    await writeStaffAuditEvent({
      actorUserId: data.user.id,
      targetUserId: data.user.id,
      action: "login_blocked",
      reason: profile === null ? "profile_missing" : "profile_inactive",
    });
    await supabase.auth.signOut();
    return { ok: false, message: LOGIN_GENERIC_ERROR };
  }

  await recordSuccessfulLogin(data.user.id);
  return {
    ok: true,
    redirectTo: loginDestination(profile.must_change_password, parsed.data.next),
  };
}

/**
 * Changes the caller's password after reauthenticating with the current
 * one. Clears the required-change flag and writes a password_changed audit
 * event that contains no password material.
 */
export async function performPasswordChange(
  session: StaffSession,
  rawInput: {
    currentPassword: unknown;
    newPassword: unknown;
    confirmPassword: unknown;
  }
): Promise<AuthActionResult> {
  const parsed = changePasswordSchema.safeParse(rawInput);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "The password input is invalid.";
    return { ok: false, message };
  }

  const supabase = await createSupabaseServerClient();

  // Reauthenticate before changing the credential.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: session.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError !== null) {
    return { ok: false, message: "The current password is incorrect." };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (updateError !== null) {
    // Supabase internals are never surfaced to the browser.
    return {
      ok: false,
      message:
        "The password could not be updated. Choose a different new password and try again.",
    };
  }

  await clearMustChangePassword(session.userId);
  await writeStaffAuditEvent({
    actorUserId: session.userId,
    targetUserId: session.userId,
    action: "password_changed",
  });

  return { ok: true, redirectTo: STAFF_HOME_PATH };
}
