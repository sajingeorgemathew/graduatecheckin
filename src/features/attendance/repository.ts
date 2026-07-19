import "server-only";

/**
 * Database access for the attendance feature. Uses the server-only service
 * role client. Errors are reported by operation name only so credential and
 * row values never leak. Raw tokens, QR payloads and token hashes never pass
 * through this module.
 *
 * Reads are limited to the columns the safe views need. Names are read only
 * so the server can render the graduate name and the staff display name;
 * emails, phone numbers, guest names, payment values and internal notes are
 * never selected. The three atomic write functions carry all attendance
 * logic, locking, recalculation and append-only guarantees; this module only
 * forwards trusted server-resolved arguments and returns their safe jsonb
 * result.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AttendanceDeltaRow } from "./calculations";
import type { Database, Json } from "@/types/database";

function db(): SupabaseClient<Database> {
  return getSupabaseAdminClient() as unknown as SupabaseClient<Database>;
}

function operationError(operation: string): Error {
  return new Error(`Attendance database operation failed: ${operation}`);
}

export interface RegistrationRecord {
  id: string;
  graduateFullName: string;
  registrationStatus: string;
  registeredAdultGuests: number;
  registeredChildren0To4: number;
  registeredChildren5To10: number;
  isTest: boolean;
}

export interface RegistrationDeltaGroup {
  registrationId: string;
  rows: AttendanceDeltaRow[];
}

export interface CheckinRecord {
  id: string;
  registrationId: string;
  createdAt: string;
  entryKind: string;
  action: string;
  graduateDelta: number;
  adultGuestDelta: number;
  child0To4Delta: number;
  child5To10Delta: number;
  reason: string | null;
  recordedBy: string | null;
  staffUserId: string | null;
  reversesCheckinId: string | null;
}

export interface ActivityRecord extends CheckinRecord {
  graduateFullName: string;
}

const REGISTRATION_COLUMNS =
  "id, graduate_full_name, registration_status, registered_adult_guests, " +
  "registered_children_0_4, registered_children_5_10, is_test";

interface RawRegistration {
  id: string;
  graduate_full_name: string;
  registration_status: string;
  registered_adult_guests: number;
  registered_children_0_4: number;
  registered_children_5_10: number;
  is_test: boolean;
}

function toRegistrationRecord(row: RawRegistration): RegistrationRecord {
  return {
    id: row.id,
    graduateFullName: row.graduate_full_name,
    registrationStatus: row.registration_status,
    registeredAdultGuests: row.registered_adult_guests,
    registeredChildren0To4: row.registered_children_0_4,
    registeredChildren5To10: row.registered_children_5_10,
    isTest: row.is_test,
  };
}

export interface RegistrationBrowseFilters {
  /** A specific registration_status, or null for every status. */
  registrationStatus: string | null;
  /** A specific is_test value, or null for both. */
  isTest: boolean | null;
}

/**
 * Browses registrations of the active event by registration status and
 * environment, ordered by graduate name. Used when a supervisor filters
 * without a search term, for example to list signed-up registrations. The
 * caller applies attendance and ticket filters and caps the final result set.
 */
export async function listRegistrations(
  eventId: string,
  filters: RegistrationBrowseFilters,
  limit: number
): Promise<RegistrationRecord[]> {
  let query = db()
    .from("graduation_registrations")
    .select(REGISTRATION_COLUMNS)
    .eq("event_id", eventId);
  if (filters.registrationStatus !== null) {
    query = query.eq(
      "registration_status",
      filters.registrationStatus as
        | "eligible"
        | "review_required"
        | "cancelled"
        | "failed"
    );
  }
  if (filters.isTest !== null) {
    query = query.eq("is_test", filters.isTest);
  }
  const { data, error } = await query
    .order("graduate_full_name", { ascending: true })
    .limit(limit);
  if (error) {
    throw operationError("list registrations");
  }
  return ((data ?? []) as unknown as RawRegistration[]).map(
    toRegistrationRecord
  );
}

/** Eligible registrations of the event, used for dashboard aggregation. */
export async function listEligibleRegistrations(
  eventId: string
): Promise<RegistrationRecord[]> {
  const { data, error } = await db()
    .from("graduation_registrations")
    .select(REGISTRATION_COLUMNS)
    .eq("event_id", eventId)
    .eq("registration_status", "eligible");
  if (error) {
    throw operationError("list eligible registrations");
  }
  return ((data ?? []) as unknown as RawRegistration[]).map(
    toRegistrationRecord
  );
}

interface RawEligibleDelta {
  registration_id: string;
  graduate_delta: number;
  adult_guest_delta: number;
  child_0_4_delta: number;
  child_5_10_delta: number;
}

/**
 * All attendance deltas of the event's eligible registrations, grouped by
 * registration. Totals are always summed across the whole registration, so a
 * replaced ticket never double-counts.
 */
export async function listEligibleDeltasByRegistration(
  eventId: string
): Promise<Map<string, AttendanceDeltaRow[]>> {
  const { data, error } = await db()
    .from("graduation_checkins")
    .select(
      "registration_id, graduate_delta, adult_guest_delta, child_0_4_delta, " +
        "child_5_10_delta, graduation_registrations!inner(event_id, " +
        "registration_status)"
    )
    .eq("graduation_registrations.event_id", eventId)
    .eq("graduation_registrations.registration_status", "eligible");
  if (error) {
    throw operationError("list eligible attendance deltas");
  }
  const grouped = new Map<string, AttendanceDeltaRow[]>();
  for (const row of (data ?? []) as unknown as RawEligibleDelta[]) {
    const rows = grouped.get(row.registration_id) ?? [];
    rows.push({
      graduate_delta: row.graduate_delta,
      adult_guest_delta: row.adult_guest_delta,
      child_0_4_delta: row.child_0_4_delta,
      child_5_10_delta: row.child_5_10_delta,
    });
    grouped.set(row.registration_id, rows);
  }
  return grouped;
}

interface RawActivity {
  id: string;
  registration_id: string;
  created_at: string;
  entry_kind: string;
  action: string;
  graduate_delta: number;
  adult_guest_delta: number;
  child_0_4_delta: number;
  child_5_10_delta: number;
  reason: string | null;
  recorded_by: string | null;
  staff_user_id: string | null;
  reverses_checkin_id: string | null;
  graduation_registrations: { graduate_full_name: string } | null;
}

/** The most recent attendance entries of the event. */
export async function listRecentActivity(
  eventId: string,
  limit: number
): Promise<ActivityRecord[]> {
  const { data, error } = await db()
    .from("graduation_checkins")
    .select(
      "id, registration_id, created_at, entry_kind, action, graduate_delta, " +
        "adult_guest_delta, child_0_4_delta, child_5_10_delta, reason, " +
        "recorded_by, staff_user_id, reverses_checkin_id, " +
        "graduation_registrations!inner(event_id, graduate_full_name)"
    )
    .eq("graduation_registrations.event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw operationError("list recent attendance activity");
  }
  return ((data ?? []) as unknown as RawActivity[]).map((row) => ({
    id: row.id,
    registrationId: row.registration_id,
    createdAt: row.created_at,
    entryKind: row.entry_kind,
    action: row.action,
    graduateDelta: row.graduate_delta,
    adultGuestDelta: row.adult_guest_delta,
    child0To4Delta: row.child_0_4_delta,
    child5To10Delta: row.child_5_10_delta,
    reason: row.reason,
    recordedBy: row.recorded_by,
    staffUserId: row.staff_user_id,
    reversesCheckinId: row.reverses_checkin_id,
    graduateFullName: row.graduation_registrations?.graduate_full_name ?? "",
  }));
}

/** Resolves staff display names for a set of user ids. */
export async function resolveStaffDisplayNames(
  userIds: readonly string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter((id) => id.length > 0))];
  if (unique.length === 0) {
    return new Map();
  }
  const { data, error } = await db()
    .from("staff_profiles")
    .select("user_id, display_name")
    .in("user_id", unique);
  if (error) {
    throw operationError("resolve staff display names");
  }
  const names = new Map<string, string>();
  for (const row of (data ?? []) as {
    user_id: string;
    display_name: string;
  }[]) {
    names.set(row.user_id, row.display_name);
  }
  return names;
}

/** A registration by id, only when it belongs to the active event. */
export async function getEventRegistration(
  eventId: string,
  registrationId: string
): Promise<RegistrationRecord | null> {
  const { data, error } = await db()
    .from("graduation_registrations")
    .select(REGISTRATION_COLUMNS)
    .eq("id", registrationId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) {
    throw operationError("load event registration");
  }
  return data === null
    ? null
    : toRegistrationRecord(data as unknown as RawRegistration);
}

/** Name searches limited to the active event. */
export async function searchRegistrationsByName(
  eventId: string,
  term: string,
  limit: number
): Promise<RegistrationRecord[]> {
  const escaped = term.replace(/[%_,]/g, (match) => `\\${match}`);
  const { data, error } = await db()
    .from("graduation_registrations")
    .select(REGISTRATION_COLUMNS)
    .eq("event_id", eventId)
    .ilike("graduate_full_name", `%${escaped}%`)
    .order("graduate_full_name", { ascending: true })
    .limit(limit);
  if (error) {
    throw operationError("search registrations by name");
  }
  return ((data ?? []) as unknown as RawRegistration[]).map(
    toRegistrationRecord
  );
}

/** Source-registration-id searches (exact or prefix) within the event. */
export async function searchRegistrationsBySourceId(
  eventId: string,
  term: string,
  limit: number
): Promise<RegistrationRecord[]> {
  const escaped = term.replace(/[%_,]/g, (match) => `\\${match}`);
  const { data, error } = await db()
    .from("graduation_registrations")
    .select(REGISTRATION_COLUMNS)
    .eq("event_id", eventId)
    .ilike("source_registration_id", `${escaped}%`)
    .order("source_registration_id", { ascending: true })
    .limit(limit);
  if (error) {
    throw operationError("search registrations by source id");
  }
  return ((data ?? []) as unknown as RawRegistration[]).map(
    toRegistrationRecord
  );
}

/**
 * Exact ticket-code lookup within the event. Only a complete, exact code
 * matches; nearby or partial codes are never returned.
 */
export async function findRegistrationByTicketCode(
  eventId: string,
  ticketCode: string
): Promise<RegistrationRecord | null> {
  const { data, error } = await db()
    .from("graduation_tickets")
    .select(
      "registration_id, graduation_registrations!inner(" +
        REGISTRATION_COLUMNS +
        ", event_id)"
    )
    .eq("ticket_code", ticketCode)
    .eq("graduation_registrations.event_id", eventId)
    .maybeSingle();
  if (error) {
    throw operationError("find registration by ticket code");
  }
  if (data === null) {
    return null;
  }
  const nested = (
    data as unknown as { graduation_registrations: RawRegistration | null }
  ).graduation_registrations;
  return nested === null ? null : toRegistrationRecord(nested);
}

/** Sums delta rows for a set of registrations, grouped by registration. */
export async function listDeltasForRegistrations(
  registrationIds: readonly string[]
): Promise<Map<string, AttendanceDeltaRow[]>> {
  const grouped = new Map<string, AttendanceDeltaRow[]>();
  if (registrationIds.length === 0) {
    return grouped;
  }
  const { data, error } = await db()
    .from("graduation_checkins")
    .select(
      "registration_id, graduate_delta, adult_guest_delta, child_0_4_delta, " +
        "child_5_10_delta"
    )
    .in("registration_id", [...registrationIds]);
  if (error) {
    throw operationError("list deltas for registrations");
  }
  for (const row of (data ?? []) as unknown as RawEligibleDelta[]) {
    const rows = grouped.get(row.registration_id) ?? [];
    rows.push({
      graduate_delta: row.graduate_delta,
      adult_guest_delta: row.adult_guest_delta,
      child_0_4_delta: row.child_0_4_delta,
      child_5_10_delta: row.child_5_10_delta,
    });
    grouped.set(row.registration_id, rows);
  }
  return grouped;
}

/** Current ticket status for a set of registrations. Prefers an active
 * ticket, otherwise the most recently created ticket. */
export async function currentTicketStatusByRegistration(
  registrationIds: readonly string[]
): Promise<Map<string, string>> {
  const statuses = new Map<string, string>();
  if (registrationIds.length === 0) {
    return statuses;
  }
  const { data, error } = await db()
    .from("graduation_tickets")
    .select("registration_id, status, created_at")
    .in("registration_id", [...registrationIds])
    .order("created_at", { ascending: false });
  if (error) {
    throw operationError("load current ticket status");
  }
  for (const row of (data ?? []) as {
    registration_id: string;
    status: string;
    created_at: string;
  }[]) {
    const current = statuses.get(row.registration_id);
    if (current === undefined || row.status === "active") {
      statuses.set(row.registration_id, row.status);
    }
  }
  return statuses;
}

/** Full attendance history rows of one registration, oldest first. */
export async function listRegistrationCheckins(
  registrationId: string
): Promise<CheckinRecord[]> {
  const { data, error } = await db()
    .from("graduation_checkins")
    .select(
      "id, registration_id, created_at, entry_kind, action, graduate_delta, " +
        "adult_guest_delta, child_0_4_delta, child_5_10_delta, reason, " +
        "recorded_by, staff_user_id, reverses_checkin_id"
    )
    .eq("registration_id", registrationId)
    .order("created_at", { ascending: true });
  if (error) {
    throw operationError("list registration attendance history");
  }
  return ((data ?? []) as unknown as RawActivity[]).map((row) => ({
    id: row.id,
    registrationId: row.registration_id,
    createdAt: row.created_at,
    entryKind: row.entry_kind,
    action: row.action,
    graduateDelta: row.graduate_delta,
    adultGuestDelta: row.adult_guest_delta,
    child0To4Delta: row.child_0_4_delta,
    child5To10Delta: row.child_5_10_delta,
    reason: row.reason,
    recordedBy: row.recorded_by,
    staffUserId: row.staff_user_id,
    reversesCheckinId: row.reverses_checkin_id,
  }));
}

export interface ManualArrivalArgs {
  actorUserId: string;
  eventId: string;
  registrationId: string;
  requestId: string;
  graduateArriving: number;
  adultGuestsArriving: number;
  children0To4Arriving: number;
  children5To10Arriving: number;
  reason: string;
}

export async function applyManualArrivalRpc(
  args: ManualArrivalArgs
): Promise<Json> {
  const { data, error } = await db().rpc("apply_manual_graduation_arrival", {
    p_actor_user_id: args.actorUserId,
    p_event_id: args.eventId,
    p_registration_id: args.registrationId,
    p_request_id: args.requestId,
    p_graduate_arriving: args.graduateArriving,
    p_adult_guests_arriving: args.adultGuestsArriving,
    p_children_0_4_arriving: args.children0To4Arriving,
    p_children_5_10_arriving: args.children5To10Arriving,
    p_reason: args.reason,
  });
  if (error) {
    throw operationError("apply manual arrival");
  }
  return data ?? null;
}

export interface CorrectionArgs {
  actorUserId: string;
  eventId: string;
  registrationId: string;
  requestId: string;
  graduateDelta: number;
  adultGuestDelta: number;
  child0To4Delta: number;
  child5To10Delta: number;
  reason: string;
}

export async function applyCorrectionRpc(args: CorrectionArgs): Promise<Json> {
  const { data, error } = await db().rpc("apply_attendance_correction", {
    p_actor_user_id: args.actorUserId,
    p_event_id: args.eventId,
    p_registration_id: args.registrationId,
    p_request_id: args.requestId,
    p_graduate_delta: args.graduateDelta,
    p_adult_guest_delta: args.adultGuestDelta,
    p_child_0_4_delta: args.child0To4Delta,
    p_child_5_10_delta: args.child5To10Delta,
    p_reason: args.reason,
  });
  if (error) {
    throw operationError("apply attendance correction");
  }
  return data ?? null;
}

export interface ReversalArgs {
  actorUserId: string;
  eventId: string;
  originalCheckinId: string;
  requestId: string;
  reason: string;
}

export async function reverseCheckinRpc(args: ReversalArgs): Promise<Json> {
  const { data, error } = await db().rpc("reverse_graduation_checkin", {
    p_actor_user_id: args.actorUserId,
    p_event_id: args.eventId,
    p_original_checkin_id: args.originalCheckinId,
    p_request_id: args.requestId,
    p_reason: args.reason,
  });
  if (error) {
    throw operationError("reverse attendance entry");
  }
  return data ?? null;
}
