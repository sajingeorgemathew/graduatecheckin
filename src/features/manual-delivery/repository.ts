import "server-only";

/**
 * Database access for the Manual Delivery Desk. Uses the server-only
 * service-role client because every table involved has RLS enabled with no
 * policies. Errors are reported by operation name only so a database
 * message can never echo a graduate's details into a log.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Database,
  GraduationManualTicketSendRow,
  GraduationRegistrationRow,
  GraduationTicketDocumentRow,
  GraduationTicketRow,
  GraduateRosterCandidateInsert,
  GraduateRosterCandidateRow,
  Json,
  ManualDeliveryKindEnum,
  RegistrationGuestRow,
  RegistrationSourceOrderRow,
} from "@/types/database";

function db(): SupabaseClient<Database> {
  return getSupabaseAdminClient() as unknown as SupabaseClient<Database>;
}

function operationError(operation: string): Error {
  return new Error(`Manual delivery database operation failed: ${operation}`);
}

export async function listEventRegistrations(
  eventId: string
): Promise<GraduationRegistrationRow[]> {
  const { data, error } = await db()
    .from("graduation_registrations")
    .select("*")
    .eq("event_id", eventId)
    .order("graduate_full_name", { ascending: true });
  if (error) {
    throw operationError("list registrations");
  }
  return data ?? [];
}

export async function getRegistration(
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

export async function listGuests(
  registrationIds: readonly string[]
): Promise<Map<string, RegistrationGuestRow[]>> {
  const byRegistration = new Map<string, RegistrationGuestRow[]>();
  if (registrationIds.length === 0) {
    return byRegistration;
  }
  const { data, error } = await db()
    .from("registration_guests")
    .select("*")
    .in("registration_id", [...registrationIds])
    .order("sort_order", { ascending: true });
  if (error) {
    throw operationError("list guests");
  }
  for (const guest of data ?? []) {
    const bucket = byRegistration.get(guest.registration_id) ?? [];
    bucket.push(guest);
    byRegistration.set(guest.registration_id, bucket);
  }
  return byRegistration;
}

/** Active tickets keyed by registration. One registration holds at most one. */
export async function listActiveTickets(
  eventId: string
): Promise<Map<string, GraduationTicketRow>> {
  const registrations = await listEventRegistrations(eventId);
  const ids = registrations.map((row) => row.id);
  const byRegistration = new Map<string, GraduationTicketRow>();
  if (ids.length === 0) {
    return byRegistration;
  }
  const { data, error } = await db()
    .from("graduation_tickets")
    .select("*")
    .in("registration_id", ids)
    .eq("status", "active");
  if (error) {
    throw operationError("list active tickets");
  }
  for (const ticket of data ?? []) {
    byRegistration.set(ticket.registration_id, ticket);
  }
  return byRegistration;
}

export async function getActiveTicketForRegistration(
  registrationId: string
): Promise<GraduationTicketRow | null> {
  const { data, error } = await db()
    .from("graduation_tickets")
    .select("*")
    .eq("registration_id", registrationId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    throw operationError("load active ticket");
  }
  return data;
}

/** Current PDF documents for the event, keyed by ticket. */
export async function listCurrentDocuments(
  eventId: string
): Promise<Map<string, GraduationTicketDocumentRow>> {
  const { data, error } = await db()
    .from("graduation_ticket_documents")
    .select("*")
    .eq("event_id", eventId)
    .eq("status", "current");
  if (error) {
    throw operationError("list current documents");
  }
  const byTicket = new Map<string, GraduationTicketDocumentRow>();
  for (const document of data ?? []) {
    byTicket.set(document.ticket_id, document);
  }
  return byTicket;
}

export async function getCurrentDocumentForTicket(
  ticketId: string
): Promise<GraduationTicketDocumentRow | null> {
  const { data, error } = await db()
    .from("graduation_ticket_documents")
    .select("*")
    .eq("ticket_id", ticketId)
    .eq("status", "current")
    .maybeSingle();
  if (error) {
    throw operationError("load current document");
  }
  return data;
}

/** Registration IDs that have at least one recorded arrival. */
export async function listCheckedInRegistrations(
  registrationIds: readonly string[]
): Promise<Set<string>> {
  const checkedIn = new Set<string>();
  if (registrationIds.length === 0) {
    return checkedIn;
  }
  const { data, error } = await db()
    .from("graduation_checkins")
    .select("registration_id, graduate_delta")
    .in("registration_id", [...registrationIds])
    .eq("action", "admission");
  if (error) {
    throw operationError("list check-ins");
  }
  for (const row of (data ?? []) as Array<{
    registration_id: string;
    graduate_delta: number;
  }>) {
    if (row.graduate_delta > 0) {
      checkedIn.add(row.registration_id);
    }
  }
  return checkedIn;
}

export async function listManualSends(
  eventId: string
): Promise<GraduationManualTicketSendRow[]> {
  const { data, error } = await db()
    .from("graduation_manual_ticket_sends")
    .select("*")
    .eq("event_id", eventId)
    .order("sent_at", { ascending: false });
  if (error) {
    throw operationError("list manual sends");
  }
  return data ?? [];
}

export async function listManualSendsForRegistration(
  registrationId: string
): Promise<GraduationManualTicketSendRow[]> {
  const { data, error } = await db()
    .from("graduation_manual_ticket_sends")
    .select("*")
    .eq("registration_id", registrationId)
    .order("attempt_number", { ascending: false });
  if (error) {
    throw operationError("list registration manual sends");
  }
  return data ?? [];
}

export async function listSourceOrderLinks(
  eventId: string
): Promise<RegistrationSourceOrderRow[]> {
  const { data, error } = await db()
    .from("registration_source_orders")
    .select("*")
    .eq("event_id", eventId);
  if (error) {
    throw operationError("list source order links");
  }
  return data ?? [];
}

export async function getStaffDisplayNames(
  userIds: readonly string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) {
    return names;
  }
  const { data, error } = await db()
    .from("staff_profiles")
    .select("user_id, display_name")
    .in("user_id", unique);
  if (error) {
    throw operationError("load staff names");
  }
  for (const row of (data ?? []) as Array<{
    user_id: string;
    display_name: string;
  }>) {
    names.set(row.user_id, row.display_name);
  }
  return names;
}

export interface RecordManualSendArgs {
  registrationId: string;
  ticketId: string;
  documentId: string | null;
  sendKind: ManualDeliveryKindEnum;
  idempotencyKey: string;
  intendedRecipient: string;
  actualRecipient: string | null;
  reason: string | null;
  note: string | null;
  gmailMessageId: string | null;
  recordedBy: string | null;
}

/**
 * Records one append-only manual send. Idempotent on the supplied key, so
 * an accidental double-click reports the existing attempt instead of
 * writing a second one.
 */
export async function recordManualSendRpc(
  args: RecordManualSendArgs
): Promise<Json> {
  const { data, error } = await db().rpc("record_manual_ticket_send", {
    p_registration_id: args.registrationId,
    p_ticket_id: args.ticketId,
    p_document_id: args.documentId,
    p_send_kind: args.sendKind,
    p_idempotency_key: args.idempotencyKey,
    p_intended_recipient: args.intendedRecipient,
    p_actual_recipient: args.actualRecipient,
    p_reason: args.reason,
    p_note: args.note,
    p_gmail_message_id: args.gmailMessageId,
    p_recorded_by: args.recordedBy,
  });
  if (error) {
    throw operationError("record manual send");
  }
  return data ?? null;
}

// ---------------------------------------------------------------------
// Manual graduate creation and roster candidates
// ---------------------------------------------------------------------

export async function insertRegistration(
  insert: Database["public"]["Tables"]["graduation_registrations"]["Insert"]
): Promise<GraduationRegistrationRow> {
  const { data, error } = await db()
    .from("graduation_registrations")
    .insert(insert)
    .select("*")
    .single();
  if (error || data === null) {
    throw operationError("create registration");
  }
  return data;
}

export async function insertGuests(
  rows: Database["public"]["Tables"]["registration_guests"]["Insert"][]
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const { error } = await db().from("registration_guests").insert(rows);
  if (error) {
    throw operationError("create guests");
  }
}

export async function listRosterCandidates(
  eventId: string
): Promise<GraduateRosterCandidateRow[]> {
  const { data, error } = await db()
    .from("graduate_roster_candidates")
    .select("*")
    .eq("event_id", eventId)
    .order("full_name", { ascending: true });
  if (error) {
    throw operationError("list roster candidates");
  }
  return data ?? [];
}

export async function insertRosterCandidates(
  rows: GraduateRosterCandidateInsert[]
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }
  const { data, error } = await db()
    .from("graduate_roster_candidates")
    .insert(rows)
    .select("id");
  if (error) {
    throw operationError("insert roster candidates");
  }
  return (data ?? []).length;
}

export async function linkRosterCandidate(
  candidateId: string,
  registrationId: string
): Promise<void> {
  const { error } = await db()
    .from("graduate_roster_candidates")
    .update({ registration_id: registrationId })
    .eq("id", candidateId);
  if (error) {
    throw operationError("link roster candidate");
  }
}
