import "server-only";

/**
 * Database access for the CHECKIN-09B distribution feature.
 *
 * Uses the server-only service-role client. Errors are reported by
 * operation name only, so credentials and row values never leak. No raw QR
 * token, token hash or signing secret passes through this module.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Database,
  GraduationTicketDeliveryAttemptRow,
  GraduationTicketDeliveryBatchRow,
  GraduationTicketDeliveryResultImportRow,
  GraduationTicketDeliveryRow,
  GraduationTicketDocumentBatchItemRow,
  GraduationTicketDocumentBatchRow,
  GraduationTicketDocumentRow,
  Json,
  TicketDeliveryAttemptOutcomeEnum,
  TicketDeliveryModeEnum,
  TicketDeliveryStatusEnum,
} from "@/types/database";

function db(): SupabaseClient<Database> {
  return getSupabaseAdminClient() as unknown as SupabaseClient<Database>;
}

function operationError(operation: string): Error {
  return new Error(`Distribution database operation failed: ${operation}`);
}

const CHUNK = 1000;

// ---- Source document batch -------------------------------------------

export async function getDocumentBatch(
  batchId: string
): Promise<GraduationTicketDocumentBatchRow | null> {
  const { data, error } = await db()
    .from("graduation_ticket_document_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (error) {
    throw operationError("load document batch");
  }
  return data;
}

export async function listDocumentBatchItems(
  batchId: string
): Promise<GraduationTicketDocumentBatchItemRow[]> {
  const { data, error } = await db()
    .from("graduation_ticket_document_batch_items")
    .select("*")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });
  if (error) {
    throw operationError("list document batch items");
  }
  return data ?? [];
}

export interface EventTemplateInfo {
  id: string;
  event_code: string;
  event_name: string;
  is_test: boolean;
  status: string;
  templateVersion: number;
}

export async function getEventTemplateInfo(
  eventId: string
): Promise<EventTemplateInfo | null> {
  const { data: event, error } = await db()
    .from("graduation_events")
    .select("id, event_code, event_name, is_test, status")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    throw operationError("load event");
  }
  if (event === null) {
    return null;
  }
  const { data: settings, error: settingsError } = await db()
    .from("graduation_event_ticket_settings")
    .select("template_version")
    .eq("event_id", eventId)
    .maybeSingle();
  if (settingsError) {
    throw operationError("load event ticket settings");
  }
  return {
    id: event.id,
    event_code: event.event_code,
    event_name: event.event_name,
    is_test: event.is_test,
    status: event.status,
    templateVersion: settings?.template_version ?? 0,
  };
}

// ---- Live registrations, tickets and documents -----------------------

export interface DeliveryRegistrationRecord {
  id: string;
  event_id: string;
  graduate_full_name: string;
  email: string | null;
  registration_status: string;
}

export async function getRegistrationsByIds(
  ids: readonly string[]
): Promise<Map<string, DeliveryRegistrationRecord>> {
  const result = new Map<string, DeliveryRegistrationRecord>();
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const slice = ids.slice(offset, offset + CHUNK);
    if (slice.length === 0) {
      break;
    }
    const { data, error } = await db()
      .from("graduation_registrations")
      .select("id, event_id, graduate_full_name, email, registration_status")
      .in("id", slice);
    if (error) {
      throw operationError("load registrations");
    }
    for (const row of (data ?? []) as unknown as DeliveryRegistrationRecord[]) {
      result.set(row.id, row);
    }
  }
  return result;
}

export interface ActiveTicketRecord {
  id: string;
  registration_id: string;
  ticket_code: string;
  status: string;
}

export async function getActiveTicketsByRegistrationIds(
  ids: readonly string[]
): Promise<Map<string, ActiveTicketRecord>> {
  const result = new Map<string, ActiveTicketRecord>();
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const slice = ids.slice(offset, offset + CHUNK);
    if (slice.length === 0) {
      break;
    }
    const { data, error } = await db()
      .from("graduation_tickets")
      .select("id, registration_id, ticket_code, status")
      .in("registration_id", slice)
      .eq("status", "active");
    if (error) {
      throw operationError("load active tickets");
    }
    for (const row of (data ?? []) as unknown as ActiveTicketRecord[]) {
      result.set(row.registration_id, row);
    }
  }
  return result;
}

export async function getCurrentDocumentsByTicketIds(
  ticketIds: readonly string[]
): Promise<Map<string, GraduationTicketDocumentRow>> {
  const result = new Map<string, GraduationTicketDocumentRow>();
  for (let offset = 0; offset < ticketIds.length; offset += CHUNK) {
    const slice = ticketIds.slice(offset, offset + CHUNK);
    if (slice.length === 0) {
      break;
    }
    const { data, error } = await db()
      .from("graduation_ticket_documents")
      .select("*")
      .in("ticket_id", slice)
      .eq("status", "current");
    if (error) {
      throw operationError("load current documents");
    }
    for (const row of data ?? []) {
      result.set(row.ticket_id, row);
    }
  }
  return result;
}

/** Registration ids already committed to a non-cancelled delivery batch. */
export async function listRegistrationsInDeliveryBatches(
  eventId: string
): Promise<Set<string>> {
  const batches = await listDeliveryBatches(eventId);
  const activeIds = batches
    .filter((batch) => batch.status !== "cancelled")
    .map((batch) => batch.id);
  const result = new Set<string>();
  if (activeIds.length === 0) {
    return result;
  }
  const { data, error } = await db()
    .from("graduation_ticket_deliveries")
    .select("registration_id, status")
    .in("delivery_batch_id", activeIds);
  if (error) {
    throw operationError("list batched deliveries");
  }
  for (const row of data ?? []) {
    if (row.status !== "cancelled") {
      result.add(row.registration_id);
    }
  }
  return result;
}

// ---- Delivery batches and deliveries ----------------------------------

export async function insertDeliveryBatch(
  values: Database["public"]["Tables"]["graduation_ticket_delivery_batches"]["Insert"]
): Promise<GraduationTicketDeliveryBatchRow> {
  const { data, error } = await db()
    .from("graduation_ticket_delivery_batches")
    .insert(values)
    .select("*")
    .single();
  if (error || data === null) {
    throw operationError("insert delivery batch");
  }
  return data;
}

export async function insertDeliveries(
  values: Database["public"]["Tables"]["graduation_ticket_deliveries"]["Insert"][]
): Promise<void> {
  if (values.length === 0) {
    return;
  }
  const { error } = await db()
    .from("graduation_ticket_deliveries")
    .insert(values);
  if (error) {
    throw operationError("insert deliveries");
  }
}

export async function updateDeliveryBatch(
  batchId: string,
  values: Database["public"]["Tables"]["graduation_ticket_delivery_batches"]["Update"]
): Promise<void> {
  const { error } = await db()
    .from("graduation_ticket_delivery_batches")
    .update(values)
    .eq("id", batchId);
  if (error) {
    throw operationError("update delivery batch");
  }
}

export async function getDeliveryBatch(
  batchId: string
): Promise<GraduationTicketDeliveryBatchRow | null> {
  const { data, error } = await db()
    .from("graduation_ticket_delivery_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (error) {
    throw operationError("load delivery batch");
  }
  return data;
}

export async function listDeliveryBatches(
  eventId: string
): Promise<GraduationTicketDeliveryBatchRow[]> {
  const { data, error } = await db()
    .from("graduation_ticket_delivery_batches")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) {
    throw operationError("list delivery batches");
  }
  return data ?? [];
}

export async function listDeliveries(
  batchId: string
): Promise<GraduationTicketDeliveryRow[]> {
  const { data, error } = await db()
    .from("graduation_ticket_deliveries")
    .select("*")
    .eq("delivery_batch_id", batchId)
    .order("created_at", { ascending: true });
  if (error) {
    throw operationError("list deliveries");
  }
  return data ?? [];
}

export async function getDelivery(
  deliveryId: string
): Promise<GraduationTicketDeliveryRow | null> {
  const { data, error } = await db()
    .from("graduation_ticket_deliveries")
    .select("*")
    .eq("id", deliveryId)
    .maybeSingle();
  if (error) {
    throw operationError("load delivery");
  }
  return data;
}

export async function listDeliveryAttempts(
  deliveryId: string
): Promise<GraduationTicketDeliveryAttemptRow[]> {
  const { data, error } = await db()
    .from("graduation_ticket_delivery_attempts")
    .select("*")
    .eq("delivery_id", deliveryId)
    .order("attempt_number", { ascending: true });
  if (error) {
    throw operationError("list delivery attempts");
  }
  return data ?? [];
}

/** Every delivery status of the event, for dashboard counts. */
export async function listEventDeliveries(
  eventId: string
): Promise<GraduationTicketDeliveryRow[]> {
  const rows: GraduationTicketDeliveryRow[] = [];
  for (let offset = 0; ; offset += CHUNK) {
    const { data, error } = await db()
      .from("graduation_ticket_deliveries")
      .select("*")
      .eq("event_id", eventId)
      .order("id", { ascending: true })
      .range(offset, offset + CHUNK - 1);
    if (error) {
      throw operationError("list event deliveries");
    }
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < CHUNK) {
      break;
    }
  }
  return rows;
}

// ---- Result imports ---------------------------------------------------

export async function findAppliedResultImport(
  batchId: string,
  fileSha256: string
): Promise<GraduationTicketDeliveryResultImportRow | null> {
  const { data, error } = await db()
    .from("graduation_ticket_delivery_result_imports")
    .select("*")
    .eq("delivery_batch_id", batchId)
    .eq("file_sha256", fileSha256)
    .eq("status", "applied")
    .maybeSingle();
  if (error) {
    throw operationError("find applied result import");
  }
  return data;
}

export async function insertResultImport(
  values: Database["public"]["Tables"]["graduation_ticket_delivery_result_imports"]["Insert"]
): Promise<GraduationTicketDeliveryResultImportRow> {
  const { data, error } = await db()
    .from("graduation_ticket_delivery_result_imports")
    .insert(values)
    .select("*")
    .single();
  if (error || data === null) {
    throw operationError("insert result import");
  }
  return data;
}

export async function updateResultImport(
  importId: string,
  values: Database["public"]["Tables"]["graduation_ticket_delivery_result_imports"]["Update"]
): Promise<void> {
  const { error } = await db()
    .from("graduation_ticket_delivery_result_imports")
    .update(values)
    .eq("id", importId);
  if (error) {
    throw operationError("update result import");
  }
}

/** Attempt references already recorded for a batch, for idempotency. */
export async function listAttemptReferencesForBatch(
  batchId: string
): Promise<Set<string>> {
  const deliveries = await listDeliveries(batchId);
  const ids = deliveries.map((row) => row.id);
  const result = new Set<string>();
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const slice = ids.slice(offset, offset + CHUNK);
    if (slice.length === 0) {
      break;
    }
    const { data, error } = await db()
      .from("graduation_ticket_delivery_attempts")
      .select("attempt_reference")
      .in("delivery_id", slice);
    if (error) {
      throw operationError("list attempt references");
    }
    for (const row of data ?? []) {
      result.add(row.attempt_reference);
    }
  }
  return result;
}

// ---- Security-definer RPCs -------------------------------------------

export async function recordDeliveryAttemptRpc(args: {
  actorUserId: string;
  deliveryId: string;
  resultImportId: string | null;
  attemptReference: string;
  mode: TicketDeliveryModeEnum;
  outcome: TicketDeliveryAttemptOutcomeEnum;
  intendedRecipient: string;
  actualRecipient: string | null;
  attemptedAt: string;
  sentBy: string | null;
  provider: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sourceRowHash: string | null;
  newDeliveryStatus: TicketDeliveryStatusEnum | null;
}): Promise<Json> {
  const { data, error } = await db().rpc("record_ticket_delivery_attempt", {
    p_actor_user_id: args.actorUserId,
    p_delivery_id: args.deliveryId,
    p_result_import_id: args.resultImportId,
    p_attempt_reference: args.attemptReference,
    p_attempt_mode: args.mode,
    p_outcome: args.outcome,
    p_intended_recipient: args.intendedRecipient,
    p_actual_recipient: args.actualRecipient,
    p_attempted_at: args.attemptedAt,
    p_sent_by: args.sentBy,
    p_provider: args.provider,
    p_error_code: args.errorCode,
    p_error_message: args.errorMessage,
    p_source_row_hash: args.sourceRowHash,
    p_new_delivery_status: args.newDeliveryStatus,
  });
  if (error) {
    throw operationError("record delivery attempt");
  }
  return data ?? null;
}

export async function cancelDeliveryBatchRpc(
  actorUserId: string,
  batchId: string
): Promise<Json> {
  const { data, error } = await db().rpc("cancel_ticket_delivery_batch", {
    p_actor_user_id: actorUserId,
    p_batch_id: batchId,
  });
  if (error) {
    throw operationError("cancel delivery batch");
  }
  return data ?? null;
}

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
