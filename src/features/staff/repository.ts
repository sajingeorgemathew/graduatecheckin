import "server-only";

/**
 * Database and Auth administration access for staff management. Uses the
 * server-only service-role client. auth.admin methods are only reachable
 * from this module and are never exposed to browser code. Errors are
 * reported by operation name only so credential or row values never leak.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Database,
  Json,
  StaffProfileInsert,
  StaffProfileRow,
  StaffRole,
} from "@/types/database";
import type { StaffListFilter } from "./types";
import { writeStaffAuditEvent, type StaffAuditEvent } from "./audit";

function db(): SupabaseClient<Database> {
  return getSupabaseAdminClient() as unknown as SupabaseClient<Database>;
}

function operationError(operation: string): Error {
  return new Error(`Staff database operation failed: ${operation}`);
}

export const STAFF_PAGE_SIZE = 20;

export interface StaffListQueryResult {
  rows: StaffProfileRow[];
  totalCount: number;
}

export async function listStaffProfiles(
  filter: StaffListFilter,
  page: number,
  pageSize: number = STAFF_PAGE_SIZE
): Promise<StaffListQueryResult> {
  let query = db()
    .from("staff_profiles")
    .select("*", { count: "exact" })
    .order("display_name", { ascending: true });

  if (filter === "active") {
    query = query.eq("is_active", true);
  } else if (filter === "inactive") {
    query = query.eq("is_active", false);
  } else if (filter !== "all") {
    query = query.eq("role", filter);
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) {
    throw operationError("list staff profiles");
  }
  return { rows: data ?? [], totalCount: count ?? 0 };
}

export async function getStaffProfile(
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

export async function findStaffProfileByEmail(
  email: string
): Promise<StaffProfileRow | null> {
  const { data, error } = await db()
    .from("staff_profiles")
    .select("*")
    .eq("email_snapshot", email.trim().toLowerCase())
    .maybeSingle();
  if (error) {
    throw operationError("look up staff email");
  }
  return data;
}

export async function insertStaffProfile(
  insert: StaffProfileInsert
): Promise<void> {
  const { error } = await db().from("staff_profiles").insert(insert);
  if (error) {
    throw operationError("create staff profile");
  }
}

export async function setMustChangePassword(
  userId: string,
  value: boolean,
  actorUserId: string
): Promise<void> {
  const { error } = await db()
    .from("staff_profiles")
    .update({ must_change_password: value, updated_by: actorUserId })
    .eq("user_id", userId);
  if (error) {
    throw operationError("update password change flag");
  }
}

/**
 * Creates the Supabase Auth user server-side with a confirmed email. The
 * temporary password passes through transiently and is never stored or
 * logged by this application.
 */
export async function createAuthUser(
  email: string,
  temporaryPassword: string
): Promise<{ ok: true; userId: string } | { ok: false; code: "email_exists" | "failed" }> {
  const { data, error } = await getSupabaseAdminClient().auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  });
  if (error !== null || data.user === null) {
    const code =
      error !== null && (error.code === "email_exists" || error.status === 422)
        ? "email_exists"
        : "failed";
    return { ok: false, code };
  }
  return { ok: true, userId: data.user.id };
}

/** Removes an Auth user after a failed profile creation. Best effort. */
export async function deleteAuthUser(userId: string): Promise<boolean> {
  const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(userId);
  return error === null;
}

/** Sets a new password on the Auth user server-side. */
export async function updateAuthUserPassword(
  userId: string,
  password: string
): Promise<boolean> {
  const { error } = await getSupabaseAdminClient().auth.admin.updateUserById(
    userId,
    { password }
  );
  return error === null;
}

/**
 * Applies a role or activation change through the concurrency-safe
 * database function that protects the final active administrator.
 */
export async function applyAccessChange(
  actorUserId: string,
  targetUserId: string,
  newRole: StaffRole,
  newIsActive: boolean
): Promise<Json> {
  const { data, error } = await db().rpc("apply_staff_access_change", {
    p_actor_user_id: actorUserId,
    p_target_user_id: targetUserId,
    p_new_role: newRole,
    p_new_is_active: newIsActive,
  });
  if (error) {
    throw operationError("apply staff access change");
  }
  return data ?? null;
}

/** Dependency bundle handed to the staff service by trusted server code. */
export interface StaffServiceDeps {
  findStaffProfileByEmail(email: string): Promise<StaffProfileRow | null>;
  getStaffProfile(userId: string): Promise<StaffProfileRow | null>;
  insertStaffProfile(insert: StaffProfileInsert): Promise<void>;
  createAuthUser(
    email: string,
    temporaryPassword: string
  ): Promise<
    { ok: true; userId: string } | { ok: false; code: "email_exists" | "failed" }
  >;
  deleteAuthUser(userId: string): Promise<boolean>;
  updateAuthUserPassword(userId: string, password: string): Promise<boolean>;
  setMustChangePassword(
    userId: string,
    value: boolean,
    actorUserId: string
  ): Promise<void>;
  applyAccessChange(
    actorUserId: string,
    targetUserId: string,
    newRole: StaffRole,
    newIsActive: boolean
  ): Promise<Json>;
  writeAudit(event: StaffAuditEvent): Promise<void>;
}

export function getStaffServiceDeps(): StaffServiceDeps {
  return {
    findStaffProfileByEmail,
    getStaffProfile,
    insertStaffProfile,
    createAuthUser,
    deleteAuthUser,
    updateAuthUserPassword,
    setMustChangePassword,
    applyAccessChange,
    writeAudit: writeStaffAuditEvent,
  };
}
