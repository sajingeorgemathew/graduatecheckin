import "server-only";

/**
 * Staff access audit logging. Every staff-account administration action
 * writes one append-only row. The JSON value columns may only contain
 * profile fields; passwords, tokens, cookies and secrets are rejected
 * before anything is written.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json, StaffAccessAction } from "@/types/database";

const FORBIDDEN_KEY_PATTERN = /password|token|cookie|secret|credential/i;

/**
 * Profile flags that merely reference the password lifecycle. They carry
 * no credential material and are the only pattern exceptions permitted.
 */
const ALLOWED_KEYS = new Set(["must_change_password"]);

/**
 * Rejects audit payloads whose keys suggest credential material. This is a
 * defensive check; callers must already exclude such values.
 */
export function assertSafeAuditValues(values: Json): void {
  if (values === null || typeof values !== "object") {
    return;
  }
  if (Array.isArray(values)) {
    for (const entry of values) {
      assertSafeAuditValues(entry);
    }
    return;
  }
  for (const [key, value] of Object.entries(values)) {
    if (!ALLOWED_KEYS.has(key) && FORBIDDEN_KEY_PATTERN.test(key)) {
      throw new Error("Audit values must never contain credential fields.");
    }
    if (value !== undefined) {
      assertSafeAuditValues(value);
    }
  }
}

export interface StaffAuditEvent {
  actorUserId: string | null;
  targetUserId: string | null;
  action: StaffAccessAction;
  previousValues?: Json;
  newValues?: Json;
  reason?: string | null;
}

function db(): SupabaseClient<Database> {
  return getSupabaseAdminClient() as unknown as SupabaseClient<Database>;
}

export async function writeStaffAuditEvent(
  event: StaffAuditEvent
): Promise<void> {
  const previousValues = event.previousValues ?? {};
  const newValues = event.newValues ?? {};
  assertSafeAuditValues(previousValues);
  assertSafeAuditValues(newValues);

  const { error } = await db().from("staff_access_audit_log").insert({
    actor_user_id: event.actorUserId,
    target_user_id: event.targetUserId,
    action: event.action,
    previous_values: previousValues,
    new_values: newValues,
    reason: event.reason ?? null,
    request_id: randomUUID(),
  });
  if (error) {
    // Reported by operation only. Database errors can echo row values and
    // must never surface details to callers or logs.
    throw new Error("Staff audit write failed.");
  }
}
