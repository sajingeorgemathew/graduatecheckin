import "server-only";

/**
 * Import workflow orchestration. Route handlers stay thin and delegate
 * here. Every function re-verifies that the trusted acting session is an
 * active administrator, so no mutation relies on the Proxy or client-side
 * checks alone. The target event is fixed server-side and never accepted
 * from the browser.
 */

import { createHash } from "node:crypto";
import type { StaffSession } from "@/features/auth/types";
import type {
  Json,
  RegistrationImportRow,
  RegistrationImportRowInsert,
  RegistrationImportRowResult,
  RegistrationImportRowRow,
} from "@/types/database";
import { hasImportAccess } from "./access";
import { compareRow, finalRowResult, findMissingExisting } from "./comparison";
import { IMPORT_EVENT_CODE, IMPORT_SOURCE_SYSTEM } from "./constants";
import { selectWorksheet } from "./header-mapper";
import {
  buildNormalizedSnapshot,
  computeRowCounts,
  snapshotComparisonAction,
} from "./summaries";
import type { CountableRow } from "./summaries";
import type {
  ComparisonAction,
  ImportIssue,
  MissingExistingRegistration,
  PreviewRow,
  StructuredError,
} from "./types";
import { childGroupNotice, validateWorkbookRows } from "./validators";
import { parseWorkbook, validateImportFile } from "./workbook-parser";
import {
  createImport,
  findAppliedImportByHash,
  getEventByCode,
  getExistingRegistrations,
  getImport,
  getImportRow,
  getImportRows,
  insertImportRows,
  listImports,
  setImportRowResult,
  updateImportCounts,
  updateImportStatus,
} from "./repository";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: StructuredError };

function failure<T>(
  status: number,
  code: string,
  message: string
): ServiceResult<T> {
  return { ok: false, status, error: { error: { code, message } } };
}

function accessFailure<T>(): ServiceResult<T> {
  return failure(
    403,
    "not_authorized",
    "Administrator access is required for imports."
  );
}

/** Parses a stored JSON issue array back into typed issues. */
export function parseIssues(json: Json): ImportIssue[] {
  if (!Array.isArray(json)) {
    return [];
  }
  const issues: ImportIssue[] = [];
  for (const entry of json) {
    if (
      entry !== null &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof entry.code === "string" &&
      typeof entry.message === "string"
    ) {
      issues.push({ code: entry.code, message: entry.message });
    }
  }
  return issues;
}

function toPreviewRow(row: RegistrationImportRowRow): PreviewRow {
  return {
    id: row.id,
    source_row_number: row.source_row_number,
    source_registration_id: row.source_registration_id,
    graduate_full_name: row.graduate_full_name,
    email: row.email,
    phone: row.phone,
    gown_size: row.gown_size,
    name_pronunciation: row.name_pronunciation,
    guest_1_name: row.guest_1_name,
    guest_2_name: row.guest_2_name,
    registered_adult_guests: row.registered_adult_guests,
    registered_children_0_4: row.registered_children_0_4,
    registered_children_5_10: row.registered_children_5_10,
    expected_party_size: row.expected_party_size,
    source_order_status: row.source_order_status,
    registration_status: row.registration_status,
    payment_status: row.payment_status,
    fee_total: row.fee_total,
    tax_total: row.tax_total,
    order_total: row.order_total,
    source_order_date: row.source_order_date,
    result: row.result,
    comparison_action: snapshotComparisonAction(row.normalized_snapshot),
    validation_errors: parseIssues(row.validation_errors),
    validation_warnings: parseIssues(row.validation_warnings),
    existing_registration_id: row.existing_registration_id,
  };
}

export interface UploadInput {
  filename: string;
  sizeBytes: number;
  buffer: Buffer;
}

export interface UploadPreviewData {
  duplicate: boolean;
  importId: string;
  notices: ImportIssue[];
  previousApplied: {
    importId: string;
    appliedAt: string | null;
    totalRows: number;
  } | null;
}

/**
 * Validates and parses an uploaded workbook fully in memory, compares it
 * with existing registrations and stores the normalized preview. The
 * original file is never retained anywhere.
 */
export async function uploadAndPreview(
  actor: StaffSession,
  input: UploadInput
): Promise<ServiceResult<UploadPreviewData>> {
  if (!hasImportAccess(actor)) {
    return accessFailure();
  }

  const originalFilename = input.filename.split(/[\\/]/).pop() ?? "upload.xlsx";

  const fileIssues = validateImportFile(originalFilename, input.sizeBytes);
  if (fileIssues.length > 0) {
    return failure(400, fileIssues[0].code, fileIssues[0].message);
  }

  // The hash is calculated before any parsing for duplicate protection.
  const fileSha256 = createHash("sha256").update(input.buffer).digest("hex");

  const event = await getEventByCode(IMPORT_EVENT_CODE);
  if (event === null) {
    return failure(
      409,
      "event_not_found",
      "The development event is not present. Seed the mock data first."
    );
  }

  const previousApplied = await findAppliedImportByHash(event.id, fileSha256);
  if (previousApplied !== null) {
    // Identical file already applied: record the duplicate attempt without
    // parsing and without creating any registration changes.
    const duplicateImport = await createImport({
      event_id: event.id,
      original_filename: originalFilename,
      file_sha256: fileSha256,
      file_size_bytes: input.sizeBytes,
      worksheet_name: previousApplied.worksheet_name,
      status: "duplicate",
      created_by: actor.userId,
    });
    return {
      ok: true,
      data: {
        duplicate: true,
        importId: duplicateImport.id,
        notices: [
          {
            code: "duplicate_file",
            message:
              "This exact file was already applied to the event. " +
              "No new registration changes were created.",
          },
        ],
        previousApplied: {
          importId: previousApplied.id,
          appliedAt: previousApplied.applied_at,
          totalRows: previousApplied.total_rows,
        },
      },
    };
  }

  const parsed = parseWorkbook(input.buffer);
  if (!parsed.ok) {
    return failure(400, parsed.issue.code, parsed.issue.message);
  }

  const selection = selectWorksheet(parsed.workbook);
  if (!selection.ok) {
    return failure(400, selection.issue.code, selection.issue.message);
  }

  const dataRows = selection.selection.sheet.rows.slice(1);
  const validated = validateWorkbookRows(dataRows, selection.selection.mapping);

  const existing = await getExistingRegistrations(event.id);
  const existingByOrderId = new Map(
    existing.map((reg) => [reg.source_registration_id, reg])
  );

  const rowInserts: RegistrationImportRowInsert[] = [];
  const countable: CountableRow[] = [];
  const uploadedOrderIds = new Set<string>();

  for (const row of validated) {
    let action: ComparisonAction | null = null;
    let existingId: string | null = null;
    let snapshot: Json = {};

    if (row.normalized !== null) {
      uploadedOrderIds.add(row.normalized.source_registration_id);
      const comparison = compareRow(
        row.normalized,
        existingByOrderId.get(row.normalized.source_registration_id)
      );
      action = comparison.action;
      existingId = comparison.existingRegistrationId;
      snapshot = buildNormalizedSnapshot(row.normalized, comparison.action);
    }

    const result = finalRowResult(row.errors, row.warnings, action);
    countable.push({ result, comparison_action: action });

    rowInserts.push({
      import_id: "",
      source_row_number: row.source_row_number,
      source_registration_id: row.normalized?.source_registration_id ?? null,
      graduate_full_name: row.normalized?.graduate_full_name ?? null,
      email: row.normalized?.email ?? null,
      phone: row.normalized?.phone ?? null,
      gown_size: row.normalized?.gown_size ?? null,
      name_pronunciation: row.normalized?.name_pronunciation ?? null,
      guest_1_name: row.normalized?.guest_1_name ?? null,
      guest_2_name: row.normalized?.guest_2_name ?? null,
      registered_adult_guests: row.normalized?.registered_adult_guests ?? 0,
      registered_children_0_4: row.normalized?.registered_children_0_4 ?? 0,
      registered_children_5_10: row.normalized?.registered_children_5_10 ?? 0,
      expected_party_size: row.normalized?.expected_party_size ?? 1,
      source_order_status: row.normalized?.source_order_status ?? null,
      registration_status: row.normalized?.registration_status ?? "review_required",
      payment_status: row.normalized?.payment_status ?? "unknown",
      fee_total: row.normalized?.fee_total ?? null,
      tax_total: row.normalized?.tax_total ?? null,
      order_total: row.normalized?.order_total ?? null,
      source_order_date: row.normalized?.source_order_date ?? null,
      result,
      validation_errors: row.errors.map((issue) => ({ ...issue })),
      validation_warnings: row.warnings.map((issue) => ({ ...issue })),
      existing_registration_id: existingId,
      normalized_snapshot: snapshot,
    });
  }

  const counts = computeRowCounts(countable);
  const missing = findMissingExisting(existing, uploadedOrderIds);

  const importRecord = await createImport({
    event_id: event.id,
    original_filename: originalFilename,
    file_sha256: fileSha256,
    file_size_bytes: input.sizeBytes,
    worksheet_name: selection.selection.sheet.name,
    source_system: IMPORT_SOURCE_SYSTEM,
    status: "uploaded",
    created_by: actor.userId,
    ...counts,
    missing_existing_rows: missing.length,
  });

  await insertImportRows(
    rowInserts.map((row) => ({ ...row, import_id: importRecord.id }))
  );
  await updateImportStatus(importRecord.id, "preview_ready");

  return {
    ok: true,
    data: {
      duplicate: false,
      importId: importRecord.id,
      notices: [childGroupNotice(), ...selection.selection.notices],
      previousApplied: null,
    },
  };
}

export interface ImportDetailData {
  importRecord: RegistrationImportRow;
  rows: PreviewRow[];
  missing: MissingExistingRegistration[];
}

export async function getImportDetail(
  actor: StaffSession,
  importId: string
): Promise<ServiceResult<ImportDetailData>> {
  if (!hasImportAccess(actor)) {
    return accessFailure();
  }

  const importRecord = await getImport(importId);
  if (importRecord === null) {
    return failure(404, "import_not_found", "The import was not found.");
  }

  const rows = await getImportRows(importId);
  const existing = await getExistingRegistrations(importRecord.event_id);
  const uploadedOrderIds = new Set(
    rows
      .map((row) => row.source_registration_id)
      .filter((id): id is string => id !== null)
  );

  return {
    ok: true,
    data: {
      importRecord,
      rows: rows.map(toPreviewRow),
      missing: findMissingExisting(existing, uploadedOrderIds),
    },
  };
}

export async function listImportHistory(
  actor: StaffSession
): Promise<ServiceResult<RegistrationImportRow[]>> {
  if (!hasImportAccess(actor)) {
    return accessFailure();
  }
  const event = await getEventByCode(IMPORT_EVENT_CODE);
  if (event === null) {
    return { ok: true, data: [] };
  }
  return { ok: true, data: await listImports(event.id) };
}

const TOGGLEABLE_RESULTS: RegistrationImportRowResult[] = [
  "new",
  "update",
  "unchanged",
  "warning",
];

/**
 * Includes or excludes one preview row. Error rows are automatically
 * excluded from application and can never be included. Applied imports
 * can no longer be edited.
 */
export async function setRowInclusion(
  actor: StaffSession,
  importId: string,
  rowId: string,
  include: boolean
): Promise<ServiceResult<{ result: RegistrationImportRowResult }>> {
  if (!hasImportAccess(actor)) {
    return accessFailure();
  }

  const importRecord = await getImport(importId);
  if (importRecord === null) {
    return failure(404, "import_not_found", "The import was not found.");
  }
  if (importRecord.status !== "preview_ready") {
    return failure(
      409,
      "import_not_editable",
      "Only imports awaiting review can be edited."
    );
  }

  const row = await getImportRow(importId, rowId);
  if (row === null) {
    return failure(404, "row_not_found", "The import row was not found.");
  }

  let nextResult: RegistrationImportRowResult;

  if (!include) {
    if (!TOGGLEABLE_RESULTS.includes(row.result)) {
      return failure(
        409,
        "row_not_excludable",
        "Only reviewable rows can be excluded."
      );
    }
    nextResult = "excluded";
  } else {
    if (row.result !== "excluded") {
      return failure(
        409,
        "row_not_included",
        "Only excluded rows can be included again."
      );
    }
    if (parseIssues(row.validation_errors).length > 0) {
      return failure(
        409,
        "row_has_errors",
        "Rows with blocking errors cannot be included."
      );
    }
    const action = snapshotComparisonAction(row.normalized_snapshot);
    if (action === null) {
      return failure(
        409,
        "row_has_errors",
        "Rows with blocking errors cannot be included."
      );
    }
    nextResult =
      parseIssues(row.validation_warnings).length > 0 ? "warning" : action;
  }

  await setImportRowResult(rowId, nextResult);

  // Refresh stored counts so history and preview summaries stay accurate.
  const rows = await getImportRows(importId);
  const counts = computeRowCounts(
    rows.map((r) => ({
      result: r.result,
      comparison_action: snapshotComparisonAction(r.normalized_snapshot),
    }))
  );
  await updateImportCounts(importId, {
    ...counts,
    missing_existing_rows: importRecord.missing_existing_rows,
  });

  return { ok: true, data: { result: nextResult } };
}

export async function cancelImport(
  actor: StaffSession,
  importId: string
): Promise<ServiceResult<{ status: "cancelled" }>> {
  if (!hasImportAccess(actor)) {
    return accessFailure();
  }

  const importRecord = await getImport(importId);
  if (importRecord === null) {
    return failure(404, "import_not_found", "The import was not found.");
  }
  if (
    importRecord.status !== "preview_ready" &&
    importRecord.status !== "uploaded"
  ) {
    return failure(
      409,
      "import_not_cancellable",
      "Only imports awaiting review can be cancelled."
    );
  }

  await updateImportStatus(importId, "cancelled");
  return { ok: true, data: { status: "cancelled" } };
}
