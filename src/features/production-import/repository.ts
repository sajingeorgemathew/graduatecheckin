import "server-only";

/**
 * Database access for the production RSVP import. Uses the server-only
 * service-role client because these tables have RLS enabled with no
 * policies. Errors are reported by operation name only, because a database
 * error message can echo row values that must never reach a log or a
 * response.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Database,
  Json,
  ProductionImportGraduateInsert,
  ProductionImportGraduateRow,
  ProductionImportGraduateUpdate,
  ProductionImportSourceOrderInsert,
  ProductionImportSourceOrderRow,
  ProductionImportStatusEnum,
  ProductionRegistrationImportInsert,
  ProductionRegistrationImportRow,
  ProductionRegistrationImportUpdate,
  RegistrationSourceOrderRow,
} from "@/types/database";

function db(): SupabaseClient<Database> {
  return getSupabaseAdminClient() as unknown as SupabaseClient<Database>;
}

function operationError(operation: string): Error {
  return new Error(`Production import database operation failed: ${operation}`);
}

export async function createProductionImport(
  insert: ProductionRegistrationImportInsert
): Promise<ProductionRegistrationImportRow> {
  const { data, error } = await db()
    .from("production_registration_imports")
    .insert(insert)
    .select("*")
    .single();
  if (error || data === null) {
    throw operationError("create import");
  }
  return data;
}

export async function updateProductionImport(
  importId: string,
  update: ProductionRegistrationImportUpdate
): Promise<void> {
  const { error } = await db()
    .from("production_registration_imports")
    .update(update)
    .eq("id", importId);
  if (error) {
    throw operationError("update import");
  }
}

export async function setProductionImportStatus(
  importId: string,
  status: ProductionImportStatusEnum
): Promise<void> {
  await updateProductionImport(importId, { status });
}

export async function getProductionImport(
  importId: string
): Promise<ProductionRegistrationImportRow | null> {
  const { data, error } = await db()
    .from("production_registration_imports")
    .select("*")
    .eq("id", importId)
    .maybeSingle();
  if (error) {
    throw operationError("load import");
  }
  return data;
}

export async function listProductionImports(
  eventId: string
): Promise<ProductionRegistrationImportRow[]> {
  const { data, error } = await db()
    .from("production_registration_imports")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) {
    throw operationError("list imports");
  }
  return data ?? [];
}

export async function findAppliedImportByHash(
  eventId: string,
  fileSha256: string
): Promise<ProductionRegistrationImportRow | null> {
  const { data, error } = await db()
    .from("production_registration_imports")
    .select("*")
    .eq("event_id", eventId)
    .eq("file_sha256", fileSha256)
    .eq("status", "applied")
    .order("applied_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw operationError("check applied file");
  }
  return data;
}

export async function insertGraduates(
  rows: ProductionImportGraduateInsert[]
): Promise<ProductionImportGraduateRow[]> {
  if (rows.length === 0) {
    return [];
  }
  const { data, error } = await db()
    .from("production_import_graduates")
    .insert(rows)
    .select("*");
  if (error || data === null) {
    throw operationError("insert graduates");
  }
  return data;
}

export async function insertSourceOrders(
  rows: ProductionImportSourceOrderInsert[]
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const { error } = await db()
    .from("production_import_source_orders")
    .insert(rows);
  if (error) {
    throw operationError("insert source orders");
  }
}

export async function listGraduates(
  importId: string
): Promise<ProductionImportGraduateRow[]> {
  const { data, error } = await db()
    .from("production_import_graduates")
    .select("*")
    .eq("import_id", importId)
    .order("canonical_full_name", { ascending: true });
  if (error) {
    throw operationError("list graduates");
  }
  return data ?? [];
}

export async function getGraduate(
  importId: string,
  graduateId: string
): Promise<ProductionImportGraduateRow | null> {
  const { data, error } = await db()
    .from("production_import_graduates")
    .select("*")
    .eq("import_id", importId)
    .eq("id", graduateId)
    .maybeSingle();
  if (error) {
    throw operationError("load graduate");
  }
  return data;
}

export async function updateGraduate(
  graduateId: string,
  update: ProductionImportGraduateUpdate
): Promise<void> {
  const { error } = await db()
    .from("production_import_graduates")
    .update(update)
    .eq("id", graduateId);
  if (error) {
    throw operationError("update graduate");
  }
}

export async function listSourceOrders(
  importId: string
): Promise<ProductionImportSourceOrderRow[]> {
  const { data, error } = await db()
    .from("production_import_source_orders")
    .select("*")
    .eq("import_id", importId)
    .order("source_row_number", { ascending: true });
  if (error) {
    throw operationError("list source orders");
  }
  return data ?? [];
}

export async function updateSourceOrderRole(
  orderId: string,
  role: ProductionImportSourceOrderRow["order_role"]
): Promise<void> {
  const { error } = await db()
    .from("production_import_source_orders")
    .update({ order_role: role })
    .eq("id", orderId);
  if (error) {
    throw operationError("update source order role");
  }
}

/**
 * Existing registration-to-order links for the event. These make a repeated
 * import resolve to the registration a graduate already has, even when the
 * newer workbook carries only the supplemental guest order.
 */
export async function listRegistrationSourceOrders(
  eventId: string
): Promise<RegistrationSourceOrderRow[]> {
  const { data, error } = await db()
    .from("registration_source_orders")
    .select("*")
    .eq("event_id", eventId);
  if (error) {
    throw operationError("list registration source orders");
  }
  return data ?? [];
}

/** Invokes the atomic apply function. Never creates a ticket. */
export async function applyProductionImportRpc(
  importId: string,
  appliedBy: string | null
): Promise<Json> {
  const { data, error } = await db().rpc(
    "apply_production_registration_import",
    { p_import_id: importId, p_applied_by: appliedBy }
  );
  if (error) {
    throw operationError("apply import");
  }
  return data ?? null;
}
