import "server-only";

/**
 * Database access for the import feature. Uses the server-only service
 * role client, because the import tables have RLS enabled with no
 * policies. Errors are reported by operation name only so that database
 * error details containing row values are never surfaced or logged.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Database,
  GraduationEventRow,
  GraduationRegistrationRow,
  Json,
  RegistrationGuestRow,
  RegistrationImportInsert,
  RegistrationImportRow,
  RegistrationImportRowInsert,
  RegistrationImportRowRow,
  RegistrationImportRowResult,
  RegistrationImportStatus,
} from "@/types/database";
import type { ExistingRegistrationSummary } from "./types";
import { IMPORT_SOURCE_SYSTEM } from "./constants";

function db(): SupabaseClient<Database> {
  return getSupabaseAdminClient() as unknown as SupabaseClient<Database>;
}

function operationError(operation: string): Error {
  // Database error details are intentionally not included. They can echo
  // row values, which must never appear in logs or responses.
  return new Error(`Import database operation failed: ${operation}`);
}

export async function getEventByCode(
  eventCode: string
): Promise<GraduationEventRow | null> {
  const { data, error } = await db()
    .from("graduation_events")
    .select("*")
    .eq("event_code", eventCode)
    .maybeSingle();
  if (error) {
    throw operationError("load event");
  }
  return data;
}

export async function findAppliedImportByHash(
  eventId: string,
  fileSha256: string
): Promise<RegistrationImportRow | null> {
  const { data, error } = await db()
    .from("registration_imports")
    .select("*")
    .eq("event_id", eventId)
    .eq("file_sha256", fileSha256)
    .eq("status", "applied")
    .maybeSingle();
  if (error) {
    throw operationError("check duplicate file");
  }
  return data;
}

export async function createImport(
  insert: RegistrationImportInsert
): Promise<RegistrationImportRow> {
  const { data, error } = await db()
    .from("registration_imports")
    .insert(insert)
    .select("*")
    .single();
  if (error || data === null) {
    throw operationError("create import");
  }
  return data;
}

export async function insertImportRows(
  rows: RegistrationImportRowInsert[]
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const { error } = await db().from("registration_import_rows").insert(rows);
  if (error) {
    throw operationError("insert import rows");
  }
}

export async function updateImportStatus(
  importId: string,
  status: RegistrationImportStatus
): Promise<void> {
  const { error } = await db()
    .from("registration_imports")
    .update({ status })
    .eq("id", importId);
  if (error) {
    throw operationError("update import status");
  }
}

export async function updateImportCounts(
  importId: string,
  counts: Pick<
    RegistrationImportInsert,
    | "total_rows"
    | "new_rows"
    | "updated_rows"
    | "unchanged_rows"
    | "warning_rows"
    | "error_rows"
    | "excluded_rows"
    | "missing_existing_rows"
  >
): Promise<void> {
  const { error } = await db()
    .from("registration_imports")
    .update(counts)
    .eq("id", importId);
  if (error) {
    throw operationError("update import counts");
  }
}

export async function listImports(
  eventId: string
): Promise<RegistrationImportRow[]> {
  const { data, error } = await db()
    .from("registration_imports")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) {
    throw operationError("list imports");
  }
  return data ?? [];
}

export async function getImport(
  importId: string
): Promise<RegistrationImportRow | null> {
  const { data, error } = await db()
    .from("registration_imports")
    .select("*")
    .eq("id", importId)
    .maybeSingle();
  if (error) {
    throw operationError("load import");
  }
  return data;
}

export async function getImportRows(
  importId: string
): Promise<RegistrationImportRowRow[]> {
  const { data, error } = await db()
    .from("registration_import_rows")
    .select("*")
    .eq("import_id", importId)
    .order("source_row_number", { ascending: true });
  if (error) {
    throw operationError("load import rows");
  }
  return data ?? [];
}

export async function getImportRow(
  importId: string,
  rowId: string
): Promise<RegistrationImportRowRow | null> {
  const { data, error } = await db()
    .from("registration_import_rows")
    .select("*")
    .eq("import_id", importId)
    .eq("id", rowId)
    .maybeSingle();
  if (error) {
    throw operationError("load import row");
  }
  return data;
}

export async function setImportRowResult(
  rowId: string,
  result: RegistrationImportRowResult
): Promise<void> {
  const { error } = await db()
    .from("registration_import_rows")
    .update({ result })
    .eq("id", rowId);
  if (error) {
    throw operationError("update import row result");
  }
}

/**
 * Loads existing registrations for the event and import source system,
 * including their adult guest names, as the comparison input.
 */
export async function getExistingRegistrations(
  eventId: string
): Promise<ExistingRegistrationSummary[]> {
  const { data, error } = await db()
    .from("graduation_registrations")
    .select("*")
    .eq("event_id", eventId)
    .eq("source_system", IMPORT_SOURCE_SYSTEM)
    .not("source_registration_id", "is", null);
  if (error) {
    throw operationError("load existing registrations");
  }

  const registrations: GraduationRegistrationRow[] = data ?? [];
  if (registrations.length === 0) {
    return [];
  }

  const ids = registrations.map((registration) => registration.id);
  const { data: guestData, error: guestError } = await db()
    .from("registration_guests")
    .select("*")
    .in("registration_id", ids)
    .eq("guest_category", "adult")
    .order("sort_order", { ascending: true });
  if (guestError) {
    throw operationError("load existing guests");
  }

  const guestsByRegistration = new Map<string, string[]>();
  for (const guest of (guestData ?? []) as RegistrationGuestRow[]) {
    if (guest.guest_name === null) {
      continue;
    }
    const names = guestsByRegistration.get(guest.registration_id) ?? [];
    names.push(guest.guest_name);
    guestsByRegistration.set(guest.registration_id, names);
  }

  return registrations
    .filter(
      (registration): registration is GraduationRegistrationRow & {
        source_registration_id: string;
      } => registration.source_registration_id !== null
    )
    .map((registration) => ({
      id: registration.id,
      source_registration_id: registration.source_registration_id,
      graduate_full_name: registration.graduate_full_name,
      email: registration.email,
      phone: registration.phone,
      gown_size: registration.gown_size,
      name_pronunciation: registration.name_pronunciation,
      registered_adult_guests: registration.registered_adult_guests,
      registered_children_0_4: registration.registered_children_0_4,
      registered_children_5_10: registration.registered_children_5_10,
      registration_status: registration.registration_status,
      payment_status: registration.payment_status,
      fee_total: registration.fee_total,
      tax_total: registration.tax_total,
      order_total: registration.order_total,
      source_order_date: registration.source_order_date,
      adult_guest_names: guestsByRegistration.get(registration.id) ?? [],
    }));
}

/** Invokes the atomic database apply function. */
export async function applyImportRpc(importId: string): Promise<Json> {
  const { data, error } = await db().rpc("apply_registration_import", {
    p_import_id: importId,
  });
  if (error) {
    throw operationError("apply import");
  }
  return data ?? null;
}
