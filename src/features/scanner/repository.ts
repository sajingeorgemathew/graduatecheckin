import "server-only";

/**
 * Database access for the scanner feature. Uses the server-only service
 * role client. Errors are reported by operation name only so credential
 * and row values never leak. Raw tokens and QR payloads never pass
 * through this module.
 *
 * This module only reads graduation_checkins. CHECKIN-06 validates
 * tickets; it never inserts, reverses or modifies check-in records.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Database,
  GraduationRegistrationRow,
  GraduationTicketRow,
  TicketScanAttemptInsert,
} from "@/types/database";
import type { CheckinDeltaRow } from "./attendance-summary";

function db(): SupabaseClient<Database> {
  return getSupabaseAdminClient() as unknown as SupabaseClient<Database>;
}

function operationError(operation: string): Error {
  return new Error(`Scanner database operation failed: ${operation}`);
}

export async function getScannerTicketById(
  ticketId: string
): Promise<GraduationTicketRow | null> {
  const { data, error } = await db()
    .from("graduation_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) {
    throw operationError("load ticket by id");
  }
  return data;
}

/**
 * Exact ticket-code lookup. The caller must pass a complete normalized
 * code; this query never performs partial or fuzzy matching and never
 * returns nearby codes.
 */
export async function getScannerTicketByCode(
  ticketCode: string
): Promise<GraduationTicketRow | null> {
  const { data, error } = await db()
    .from("graduation_tickets")
    .select("*")
    .eq("ticket_code", ticketCode)
    .maybeSingle();
  if (error) {
    throw operationError("load ticket by code");
  }
  return data;
}

export async function getScannerRegistrationById(
  registrationId: string
): Promise<GraduationRegistrationRow | null> {
  const { data, error } = await db()
    .from("graduation_registrations")
    .select("*")
    .eq("id", registrationId)
    .maybeSingle();
  if (error) {
    throw operationError("load registration");
  }
  return data;
}

/**
 * Loads the delta columns of every check-in row of the registration.
 * Attendance is always calculated across the whole registration, never
 * from the currently scanned ticket only.
 */
export async function listRegistrationCheckinDeltas(
  registrationId: string
): Promise<CheckinDeltaRow[]> {
  const { data, error } = await db()
    .from("graduation_checkins")
    .select(
      "graduate_delta, adult_guest_delta, child_0_4_delta, child_5_10_delta"
    )
    .eq("registration_id", registrationId);
  if (error) {
    throw operationError("list registration check-ins");
  }
  return data ?? [];
}

/** Counts the staff user's scan attempts since the window start. */
export async function countScanAttemptsSince(
  staffUserId: string,
  sinceIso: string
): Promise<number> {
  const { count, error } = await db()
    .from("ticket_scan_attempts")
    .select("id", { count: "exact", head: true })
    .eq("staff_user_id", staffUserId)
    .gte("created_at", sinceIso);
  if (error) {
    throw operationError("count recent scan attempts");
  }
  return count ?? 0;
}

/**
 * Records one privacy-safe validation attempt and returns its id. When
 * the same staff user retries the same request id, the unique constraint
 * makes the write idempotent and the existing attempt id is returned.
 */
export async function insertScanAttempt(
  attempt: TicketScanAttemptInsert
): Promise<string | null> {
  const { data, error } = await db()
    .from("ticket_scan_attempts")
    .insert(attempt)
    .select("id")
    .maybeSingle();
  if (error === null) {
    return data?.id ?? null;
  }
  if (error.code !== "23505") {
    throw operationError("record scan attempt");
  }
  const { data: existing, error: lookupError } = await db()
    .from("ticket_scan_attempts")
    .select("id")
    .eq("staff_user_id", attempt.staff_user_id)
    .eq("request_id", attempt.request_id)
    .maybeSingle();
  if (lookupError) {
    throw operationError("load existing scan attempt");
  }
  return existing?.id ?? null;
}
