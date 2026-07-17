import "server-only";

/**
 * Trusted staff-session resolution. The Supabase Auth user is verified
 * with auth.getUser() on the server and the staff profile is loaded with
 * trusted service-role access. Nothing here ever trusts client-supplied
 * user IDs, roles or cookies beyond the Supabase session itself.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StaffProfileRow } from "@/types/database";
import { getStaffProfileByUserId } from "./repository";
import type { SessionResolution, StaffSession } from "./types";

interface VerifiedAuthUser {
  id: string;
  email: string | null;
}

/**
 * Pure combination of a verified Auth user and the trusted profile row.
 * Kept free of I/O so authorization behavior is fully unit testable.
 */
export function evaluateStaffAccess(
  user: VerifiedAuthUser | null,
  profile: StaffProfileRow | null
): SessionResolution {
  if (user === null) {
    return { kind: "anonymous" };
  }
  if (profile === null || profile.user_id !== user.id) {
    return { kind: "no_profile", userId: user.id };
  }
  if (!profile.is_active) {
    return { kind: "inactive", userId: user.id };
  }
  const email = (user.email ?? profile.email_snapshot).trim().toLowerCase();
  const session: StaffSession = {
    userId: user.id,
    email,
    displayName: profile.display_name,
    role: profile.role,
    isActive: profile.is_active,
    mustChangePassword: profile.must_change_password,
  };
  return { kind: "active", session };
}

/**
 * Resolves the caller. auth.getUser() revalidates the JWT with Supabase,
 * so a deleted or invalid Auth user resolves as anonymous.
 */
export async function resolveStaffSession(): Promise<SessionResolution> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error !== null || data.user === null) {
    return { kind: "anonymous" };
  }
  const profile = await getStaffProfileByUserId(data.user.id);
  return evaluateStaffAccess(
    { id: data.user.id, email: data.user.email ?? null },
    profile
  );
}

/** The active staff session, or null for anyone who is not active staff. */
export async function getOptionalStaffSession(): Promise<StaffSession | null> {
  const resolution = await resolveStaffSession();
  return resolution.kind === "active" ? resolution.session : null;
}
