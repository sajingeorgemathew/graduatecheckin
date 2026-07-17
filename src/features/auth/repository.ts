import "server-only";

/**
 * Trusted staff-profile access for authentication. Uses the server-only
 * service-role client because staff_profiles has RLS enabled with no
 * policies. Errors are reported by operation name only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, StaffProfileRow } from "@/types/database";

function db(): SupabaseClient<Database> {
  return getSupabaseAdminClient() as unknown as SupabaseClient<Database>;
}

function operationError(operation: string): Error {
  return new Error(`Auth database operation failed: ${operation}`);
}

export async function getStaffProfileByUserId(
  userId: string
): Promise<StaffProfileRow | null> {
  const { data, error } = await db()
    .from("staff_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw operationError("load staff profile");
  }
  return data;
}

/** Records a fully authorized login. Never called for blocked sign-ins. */
export async function recordSuccessfulLogin(userId: string): Promise<void> {
  const { error } = await db()
    .from("staff_profiles")
    .update({ last_login_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) {
    throw operationError("record login time");
  }
}

/** Clears the required-password-change flag after a completed change. */
export async function clearMustChangePassword(userId: string): Promise<void> {
  const { error } = await db()
    .from("staff_profiles")
    .update({ must_change_password: false, updated_by: userId })
    .eq("user_id", userId);
  if (error) {
    throw operationError("clear password change flag");
  }
}
