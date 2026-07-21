import "server-only";

/**
 * Database access for the ticket-document feature.
 *
 * Uses the server-only service-role client. Errors are reported by
 * operation name only, so credentials and row values never leak. No raw QR
 * token or token hash passes through this module.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Database,
  GraduationEventRow,
  GraduationEventTicketSettingsRow,
  GraduationRegistrationRow,
  GraduationTicketDocumentBatchItemRow,
  GraduationTicketDocumentBatchRow,
  GraduationTicketDocumentRow,
  GraduationTicketRow,
  Json,
  TicketDocumentInvalidationReasonEnum,
} from "@/types/database";

import type { GuestRecordInput } from "./party";

function db(): SupabaseClient<Database> {
  return getSupabaseAdminClient() as unknown as SupabaseClient<Database>;
}

function operationError(operation: string): Error {
  return new Error(`Ticket document database operation failed: ${operation}`);
}

const FETCH_CHUNK_SIZE = 1000;

// ---- Event ticket settings -------------------------------------------

export async function getEventTicketSettings(
  eventId: string
): Promise<GraduationEventTicketSettingsRow | null> {
  const { data, error } = await db()
    .from("graduation_event_ticket_settings")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) {
    throw operationError("load event ticket settings");
  }
  return data;
}

// ---- Registrations and guests ----------------------------------------

export interface DocumentRegistrationRecord {
  id: string;
  event_id: string;
  graduate_full_name: string;
  email: string | null;
  registration_status: string;
  registered_adult_guests: number;
  registered_children_0_4: number;
  registered_children_5_10: number;
  expected_party_size: number;
  is_test: boolean;
}

const REGISTRATION_SELECT =
  "id, event_id, graduate_full_name, email, registration_status, " +
  "registered_adult_guests, registered_children_0_4, " +
  "registered_children_5_10, expected_party_size, is_test";

/**
 * Loads every registration of the event in chunks. The email column is
 * selected because export manifests need it; it is never forwarded to any
 * browser-facing list shape, only to administrator-only batch snapshots.
 */
export async function listEventRegistrations(
  eventId: string
): Promise<DocumentRegistrationRecord[]> {
  const rows: DocumentRegistrationRecord[] = [];
  for (let offset = 0; ; offset += FETCH_CHUNK_SIZE) {
    const { data, error } = await db()
      .from("graduation_registrations")
      .select(REGISTRATION_SELECT)
      .eq("event_id", eventId)
      .order("id", { ascending: true })
      .range(offset, offset + FETCH_CHUNK_SIZE - 1);
    if (error) {
      throw operationError("list event registrations");
    }
    const chunk = (data ?? []) as unknown as DocumentRegistrationRecord[];
    rows.push(...chunk);
    if (chunk.length < FETCH_CHUNK_SIZE) {
      break;
    }
  }
  return rows;
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

/** Normalized guest rows. These, not import columns, supply guest names. */
export async function listRegistrationGuests(
  registrationId: string
): Promise<GuestRecordInput[]> {
  const { data, error } = await db()
    .from("registration_guests")
    .select("guest_category, guest_name, sort_order")
    .eq("registration_id", registrationId)
    .order("sort_order", { ascending: true });
  if (error) {
    throw operationError("list registration guests");
  }
  return (data ?? []).map((row) => ({
    guestCategory: row.guest_category,
    guestName: row.guest_name,
    sortOrder: row.sort_order,
  }));
}

/** Guest rows for many registrations at once, keyed by registration id. */
export async function listGuestsForRegistrations(
  registrationIds: readonly string[]
): Promise<Map<string, GuestRecordInput[]>> {
  const result = new Map<string, GuestRecordInput[]>();
  if (registrationIds.length === 0) {
    return result;
  }
  const { data, error } = await db()
    .from("registration_guests")
    .select("registration_id, guest_category, guest_name, sort_order")
    .in("registration_id", [...registrationIds])
    .order("sort_order", { ascending: true });
  if (error) {
    throw operationError("list guests for registrations");
  }
  for (const row of data ?? []) {
    const existing = result.get(row.registration_id) ?? [];
    existing.push({
      guestCategory: row.guest_category,
      guestName: row.guest_name,
      sortOrder: row.sort_order,
    });
    result.set(row.registration_id, existing);
  }
  return result;
}

// ---- Tickets -----------------------------------------------------------

export async function getTicket(
  ticketId: string
): Promise<GraduationTicketRow | null> {
  const { data, error } = await db()
    .from("graduation_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) {
    throw operationError("load ticket");
  }
  return data;
}

export interface ActiveTicketRecord {
  id: string;
  registration_id: string;
  ticket_code: string;
  status: string;
}

/** Active tickets of the event, keyed by registration id. */
export async function listActiveTicketsByRegistration(
  eventId: string
): Promise<Map<string, ActiveTicketRecord>> {
  const registrations = await listEventRegistrations(eventId);
  const ids = registrations.map((row) => row.id);
  const result = new Map<string, ActiveTicketRecord>();
  if (ids.length === 0) {
    return result;
  }
  for (let offset = 0; offset < ids.length; offset += FETCH_CHUNK_SIZE) {
    const slice = ids.slice(offset, offset + FETCH_CHUNK_SIZE);
    const { data, error } = await db()
      .from("graduation_tickets")
      .select("id, registration_id, ticket_code, status")
      .in("registration_id", slice)
      .eq("status", "active");
    if (error) {
      throw operationError("list active tickets");
    }
    for (const row of (data ?? []) as unknown as ActiveTicketRecord[]) {
      result.set(row.registration_id, row);
    }
  }
  return result;
}

export async function getEvent(
  eventId: string
): Promise<GraduationEventRow | null> {
  const { data, error } = await db()
    .from("graduation_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    throw operationError("load event");
  }
  return data;
}

// ---- Documents ---------------------------------------------------------

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

export async function getDocument(
  documentId: string
): Promise<GraduationTicketDocumentRow | null> {
  const { data, error } = await db()
    .from("graduation_ticket_documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (error) {
    throw operationError("load document");
  }
  return data;
}

/** Full append-only history for one ticket, newest version first. */
export async function listDocumentHistory(
  ticketId: string
): Promise<GraduationTicketDocumentRow[]> {
  const { data, error } = await db()
    .from("graduation_ticket_documents")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("document_version", { ascending: false });
  if (error) {
    throw operationError("list document history");
  }
  return data ?? [];
}

/** Every document of the event, used to build the administration page. */
export async function listEventDocuments(
  eventId: string
): Promise<GraduationTicketDocumentRow[]> {
  const rows: GraduationTicketDocumentRow[] = [];
  for (let offset = 0; ; offset += FETCH_CHUNK_SIZE) {
    const { data, error } = await db()
      .from("graduation_ticket_documents")
      .select("*")
      .eq("event_id", eventId)
      .order("id", { ascending: true })
      .range(offset, offset + FETCH_CHUNK_SIZE - 1);
    if (error) {
      throw operationError("list event documents");
    }
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < FETCH_CHUNK_SIZE) {
      break;
    }
  }
  return rows;
}

/** Atomic version allocation, supersede and insert. */
export async function finalizeTicketDocumentRpc(args: {
  actorUserId: string;
  ticketId: string;
  documentId: string;
  templateVersion: number;
  storageBucket: string;
  storagePath: string;
  fileName: string;
  fileSizeBytes: number;
  sha256Checksum: string;
  sourceFingerprint: string;
  graduateNameSnapshot: string;
  ticketCodeSnapshot: string;
  registeredPartySnapshot: Json;
  eventSnapshot: Json;
}): Promise<Json> {
  const { data, error } = await db().rpc("finalize_graduation_ticket_document", {
    p_actor_user_id: args.actorUserId,
    p_ticket_id: args.ticketId,
    p_document_id: args.documentId,
    p_template_version: args.templateVersion,
    p_storage_bucket: args.storageBucket,
    p_storage_path: args.storagePath,
    p_file_name: args.fileName,
    p_file_size_bytes: args.fileSizeBytes,
    p_sha256_checksum: args.sha256Checksum,
    p_source_fingerprint: args.sourceFingerprint,
    p_graduate_name_snapshot: args.graduateNameSnapshot,
    p_ticket_code_snapshot: args.ticketCodeSnapshot,
    p_registered_party_snapshot: args.registeredPartySnapshot,
    p_event_snapshot: args.eventSnapshot,
  });
  if (error) {
    throw operationError("finalize document");
  }
  return data ?? null;
}

/** Marks every document of a replaced or revoked ticket as invalidated. */
export async function invalidateTicketDocumentsRpc(
  actorUserId: string,
  ticketId: string,
  reason: TicketDocumentInvalidationReasonEnum
): Promise<Json> {
  const { data, error } = await db().rpc(
    "invalidate_graduation_ticket_documents",
    {
      p_actor_user_id: actorUserId,
      p_ticket_id: ticketId,
      p_reason: reason,
    }
  );
  if (error) {
    throw operationError("invalidate documents");
  }
  return data ?? null;
}

// ---- Batches -----------------------------------------------------------

export async function getBatch(
  batchId: string
): Promise<GraduationTicketDocumentBatchRow | null> {
  const { data, error } = await db()
    .from("graduation_ticket_document_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (error) {
    throw operationError("load batch");
  }
  return data;
}

export async function listBatches(
  eventId: string
): Promise<GraduationTicketDocumentBatchRow[]> {
  const { data, error } = await db()
    .from("graduation_ticket_document_batches")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) {
    throw operationError("list batches");
  }
  return data ?? [];
}

export async function listBatchItems(
  batchId: string
): Promise<GraduationTicketDocumentBatchItemRow[]> {
  const { data, error } = await db()
    .from("graduation_ticket_document_batch_items")
    .select("*")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });
  if (error) {
    throw operationError("list batch items");
  }
  return data ?? [];
}

/** Every registration id already committed to a non-cancelled batch. */
export async function listRegistrationsInBatches(
  eventId: string
): Promise<Set<string>> {
  const batches = await listBatches(eventId);
  const activeBatchIds = batches
    .filter((batch) => batch.status !== "cancelled")
    .map((batch) => batch.id);
  const result = new Set<string>();
  if (activeBatchIds.length === 0) {
    return result;
  }
  const { data, error } = await db()
    .from("graduation_ticket_document_batch_items")
    .select("registration_id")
    .in("batch_id", activeBatchIds);
  if (error) {
    throw operationError("list batched registrations");
  }
  for (const row of data ?? []) {
    result.add(row.registration_id);
  }
  return result;
}

export async function insertBatch(
  values: Database["public"]["Tables"]["graduation_ticket_document_batches"]["Insert"]
): Promise<GraduationTicketDocumentBatchRow> {
  const { data, error } = await db()
    .from("graduation_ticket_document_batches")
    .insert(values)
    .select("*")
    .single();
  if (error || data === null) {
    throw operationError("insert batch");
  }
  return data;
}

export async function insertBatchItems(
  values: Database["public"]["Tables"]["graduation_ticket_document_batch_items"]["Insert"][]
): Promise<void> {
  if (values.length === 0) {
    return;
  }
  const { error } = await db()
    .from("graduation_ticket_document_batch_items")
    .insert(values);
  if (error) {
    throw operationError("insert batch items");
  }
}

export async function updateBatch(
  batchId: string,
  values: Database["public"]["Tables"]["graduation_ticket_document_batches"]["Update"]
): Promise<void> {
  const { error } = await db()
    .from("graduation_ticket_document_batches")
    .update(values)
    .eq("id", batchId);
  if (error) {
    throw operationError("update batch");
  }
}

/** Display names for staff user IDs. Emails are never returned. */
export async function getStaffDisplayNames(
  userIds: readonly string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)].filter((id) => id.length > 0);
  if (unique.length === 0) {
    return new Map();
  }
  const { data, error } = await db()
    .from("staff_profiles")
    .select("user_id, display_name")
    .in("user_id", unique);
  if (error) {
    throw operationError("load staff display names");
  }
  return new Map(
    (data ?? []).map((row) => [row.user_id, row.display_name] as const)
  );
}
