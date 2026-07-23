import "server-only";

/**
 * Production RSVP import orchestration.
 *
 * Route handlers stay thin and delegate here. Every function re-verifies
 * that the trusted acting session is an administrator, so no mutation
 * relies on the Proxy or on a client-side check. The target event is fixed
 * server-side from ACTIVE_GRADUATION_EVENT_CODE and is never accepted from
 * the browser.
 *
 * The uploaded workbook is parsed entirely in memory. The file itself is
 * never written to disk, to storage, to the database or to version control.
 */

import { createHash } from "node:crypto";
import { canImportRegistrations } from "@/features/auth/permissions";
import type { StaffSession } from "@/features/auth/types";
import { ACTIVE_EVENT_FAILURE_MESSAGES } from "@/features/events/active-event";
import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import { parseIssues } from "@/features/imports/service";
import {
  parseWorkbook,
  validateImportFile,
} from "@/features/imports/workbook-parser";
import type {
  Json,
  ProductionImportGraduateInsert,
  ProductionImportGraduateRow,
  ProductionImportSourceOrderInsert,
  ProductionImportSourceOrderRow,
  ProductionRegistrationImportRow,
} from "@/types/database";
import { CHILD_GROUP_NORMALIZATION_NOTICE } from "./constants";
import { selectRsvpWorksheet } from "./header-mapper";
import { countReconciliation, reconcileWorkbook } from "./reconciliation";
import * as repo from "./repository";
import { normalizeWorkbookRows } from "./rows";
import type { ReconcileGraduateInput } from "./schemas";
import type {
  ImportIssue,
  PreviewGraduate,
  PreviewSourceOrder,
  ProductionImportDetail,
  ProductionImportSummary,
  ReviewReason,
  StructuredError,
} from "./types";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: StructuredError };

export function failure<T>(
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
    "Administrator access is required for the production import."
  );
}

function jsonStringArray(value: Json): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function parseReviewReasons(value: Json): ReviewReason[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const reasons: ReviewReason[] = [];
  for (const entry of value) {
    if (
      entry !== null &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof entry.code === "string" &&
      typeof entry.message === "string"
    ) {
      reasons.push({
        code: entry.code as ReviewReason["code"],
        message: entry.message,
        blocking: entry.blocking === true,
      });
    }
  }
  return reasons;
}

// ---------------------------------------------------------------------
// Upload and preview
// ---------------------------------------------------------------------

export interface UploadInput {
  filename: string;
  sizeBytes: number;
  buffer: Buffer;
}

export interface UploadPreviewData {
  importId: string;
  notices: ImportIssue[];
  previouslyApplied: {
    importId: string;
    appliedAt: string | null;
  } | null;
}

/**
 * Validates, parses and reconciles an uploaded RSVP workbook, then stores
 * the reviewable proposal. Nothing about a registration, ticket, PDF or
 * delivery changes here.
 *
 * Re-uploading a file that was already applied is allowed and is not an
 * error: reconciliation and the apply function are both idempotent on the
 * source order IDs, so a repeated upload creates no duplicate registration.
 * The previous application is reported so the administrator knows.
 */
export async function uploadAndReconcile(
  actor: StaffSession,
  input: UploadInput
): Promise<ServiceResult<UploadPreviewData>> {
  if (!canImportRegistrations(actor.role)) {
    return accessFailure();
  }

  const originalFilename = input.filename.split(/[\\/]/).pop() ?? "upload.xlsx";
  const fileIssues = validateImportFile(originalFilename, input.sizeBytes);
  if (fileIssues.length > 0) {
    return failure(400, fileIssues[0].code, fileIssues[0].message);
  }

  const fileSha256 = createHash("sha256").update(input.buffer).digest("hex");

  const eventResolution = await resolveActiveEvent();
  if (!eventResolution.ok) {
    return failure(
      409,
      eventResolution.code,
      ACTIVE_EVENT_FAILURE_MESSAGES[eventResolution.code]
    );
  }
  const event = eventResolution.event;

  const parsedWorkbook = parseWorkbook(input.buffer);
  if (!parsedWorkbook.ok) {
    return failure(
      400,
      parsedWorkbook.issue.code,
      parsedWorkbook.issue.message
    );
  }

  const selection = selectRsvpWorksheet(parsedWorkbook.workbook);
  if (!selection.ok) {
    return failure(400, selection.issue.code, selection.issue.message);
  }

  const parsedRows = normalizeWorkbookRows(
    selection.selection.dataRows,
    selection.selection.mapping,
    selection.selection.headerRowIndex
  );
  if (parsedRows.orders.length === 0) {
    return failure(
      400,
      "no_usable_rows",
      "No worksheet row carried both an order ID and a graduate name. " +
        "Nothing was imported."
    );
  }

  const reconciliation = reconcileWorkbook(parsedRows);
  const counts = countReconciliation(reconciliation);

  const notices: ImportIssue[] = [
    { code: "child_group_normalized", message: CHILD_GROUP_NORMALIZATION_NOTICE },
    ...selection.selection.notices,
    ...reconciliation.notices,
  ];

  const previouslyApplied = await repo.findAppliedImportByHash(
    event.id,
    fileSha256
  );
  if (previouslyApplied !== null) {
    notices.push({
      code: "file_already_applied",
      message:
        "This exact workbook was already applied. Applying it again is " +
        "safe: existing registrations are updated in place and no " +
        "duplicate registration, guest or ticket is created.",
    });
  }

  const importRecord = await repo.createProductionImport({
    event_id: event.id,
    original_filename: originalFilename,
    file_sha256: fileSha256,
    file_size_bytes: input.sizeBytes,
    worksheet_name: selection.selection.sheetName,
    status: "uploaded",
    source_order_count: counts.sourceOrderCount,
    graduate_count: counts.graduateCount,
    duplicate_submission_count: counts.duplicateSubmissionCount,
    supplemental_order_count: counts.supplementalOrderCount,
    needs_review_count: counts.needsReviewCount,
    excluded_count: counts.excludedCount,
    expected_ticket_count: counts.expectedTicketCount,
    notices: notices.map((notice) => ({ ...notice })),
    created_by: actor.userId,
  });

  // Existing links let a follow-up workbook resolve to the registration the
  // graduate already has, so nothing is duplicated on a second import.
  const existingLinks = await repo.listRegistrationSourceOrders(event.id);
  const registrationByOrderId = new Map(
    existingLinks.map((link) => [link.source_order_id, link.registration_id])
  );

  const graduateInserts: ProductionImportGraduateInsert[] =
    reconciliation.graduates.map((graduate) => {
      const existingRegistrationId =
        graduate.orders
          .map((entry) => registrationByOrderId.get(entry.order.sourceOrderId))
          .find((value): value is string => value !== undefined) ?? null;
      return {
        import_id: importRecord.id,
        group_key: graduate.groupKey,
        canonical_full_name: graduate.canonicalFullName,
        email: graduate.email,
        phone: graduate.phone,
        gown_size: graduate.gownSize,
        name_pronunciation: graduate.namePronunciation,
        approved_adult_guests: graduate.approvedAdultGuests,
        approved_children_0_4: graduate.approvedChildren04,
        approved_children_5_10: graduate.approvedChildren510,
        approved_adult_guest_names: graduate.approvedAdultGuestNames,
        fee_total: graduate.feeTotal,
        tax_total: graduate.taxTotal,
        order_total: graduate.orderTotal,
        decision: graduate.decision,
        review_reasons: graduate.reviewReasons.map((entry) => ({ ...entry })),
        primary_source_order_id: graduate.primarySourceOrderId,
        existing_registration_id: existingRegistrationId,
      };
    });

  const storedGraduates = await repo.insertGraduates(graduateInserts);
  const graduateIdByKey = new Map(
    storedGraduates.map((row) => [row.group_key, row.id])
  );

  const orderInserts: ProductionImportSourceOrderInsert[] = [];
  for (const graduate of reconciliation.graduates) {
    const graduateId = graduateIdByKey.get(graduate.groupKey) ?? null;
    for (const entry of graduate.orders) {
      const order = entry.order;
      orderInserts.push({
        import_id: importRecord.id,
        graduate_id: graduateId,
        source_row_number: order.sourceRowNumber,
        source_order_id: order.sourceOrderId,
        order_role: entry.role,
        graduate_full_name: order.graduateFullName,
        email: order.email,
        phone: order.phone,
        gown_size: order.gownSize,
        name_pronunciation: order.namePronunciation,
        guest_1_name: order.guest1Name,
        guest_2_name: order.guest2Name,
        kids_0_4: order.kids04,
        kids_5_10: order.kids510,
        fee_total: order.feeTotal,
        tax_total: order.taxTotal,
        order_total: order.orderTotal,
        source_note: order.note,
        source_order_status: order.sourceOrderStatus,
        source_order_date: order.sourceOrderDate,
        registration_status: order.registrationStatus,
        payment_status: order.paymentStatus,
        validation_errors: order.errors.map((issue) => ({ ...issue })),
        validation_warnings: order.warnings.map((issue) => ({ ...issue })),
      });
    }
  }
  // Rejected rows keep their place in the audit trail even though they
  // belong to no graduate and can never be applied.
  for (const rejected of reconciliation.rejected) {
    orderInserts.push({
      import_id: importRecord.id,
      graduate_id: null,
      source_row_number: rejected.sourceRowNumber,
      source_order_id: rejected.sourceOrderId ?? "(missing order id)",
      order_role: "excluded",
      validation_errors: rejected.errors.map((issue) => ({ ...issue })),
    });
  }

  await repo.insertSourceOrders(orderInserts);
  await repo.setProductionImportStatus(importRecord.id, "preview_ready");

  return {
    ok: true,
    data: {
      importId: importRecord.id,
      notices,
      previouslyApplied:
        previouslyApplied === null
          ? null
          : {
              importId: previouslyApplied.id,
              appliedAt: previouslyApplied.applied_at,
            },
    },
  };
}

// ---------------------------------------------------------------------
// Preview reading
// ---------------------------------------------------------------------

function toSummary(
  row: ProductionRegistrationImportRow
): ProductionImportSummary {
  return {
    importId: row.id,
    status: row.status,
    originalFilename: row.original_filename,
    worksheetName: row.worksheet_name,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    notices: parseIssues(row.notices),
    sourceOrderCount: row.source_order_count,
    graduateCount: row.graduate_count,
    duplicateSubmissionCount: row.duplicate_submission_count,
    supplementalOrderCount: row.supplemental_order_count,
    needsReviewCount: row.needs_review_count,
    excludedCount: row.excluded_count,
    expectedTicketCount: row.expected_ticket_count,
  };
}

function toPreviewOrder(
  row: ProductionImportSourceOrderRow
): PreviewSourceOrder {
  return {
    id: row.id,
    sourceRowNumber: row.source_row_number,
    sourceOrderId: row.source_order_id,
    orderRole: row.order_role,
    graduateFullName: row.graduate_full_name,
    email: row.email,
    guest1Name: row.guest_1_name,
    guest2Name: row.guest_2_name,
    kids04: row.kids_0_4,
    kids510: row.kids_5_10,
    feeTotal: row.fee_total,
    taxTotal: row.tax_total,
    orderTotal: row.order_total,
    note: row.source_note,
    sourceOrderDate: row.source_order_date,
    warnings: parseIssues(row.validation_warnings),
    errors: parseIssues(row.validation_errors),
  };
}

function toPreviewGraduate(
  row: ProductionImportGraduateRow,
  orders: PreviewSourceOrder[]
): PreviewGraduate {
  const guestNames = jsonStringArray(row.approved_adult_guest_names);
  return {
    id: row.id,
    groupKey: row.group_key,
    canonicalFullName: row.canonical_full_name,
    email: row.email,
    phone: row.phone,
    gownSize: row.gown_size,
    namePronunciation: row.name_pronunciation,
    approvedAdultGuests: row.approved_adult_guests,
    approvedChildren04: row.approved_children_0_4,
    approvedChildren510: row.approved_children_5_10,
    approvedAdultGuestNames: guestNames,
    approvedPartySize:
      1 +
      row.approved_adult_guests +
      row.approved_children_0_4 +
      row.approved_children_5_10,
    feeTotal: Number(row.fee_total),
    taxTotal: Number(row.tax_total),
    orderTotal: Number(row.order_total),
    decision: row.decision,
    reviewReasons: parseReviewReasons(row.review_reasons),
    reconciliationNote: row.reconciliation_note,
    primarySourceOrderId: row.primary_source_order_id,
    existingRegistrationId: row.existing_registration_id,
    orders,
  };
}

export async function getProductionImportDetail(
  actor: StaffSession,
  importId: string
): Promise<ServiceResult<ProductionImportDetail>> {
  if (!canImportRegistrations(actor.role)) {
    return accessFailure();
  }

  const importRecord = await repo.getProductionImport(importId);
  if (importRecord === null) {
    return failure(404, "import_not_found", "The import was not found.");
  }

  const [graduates, orders] = await Promise.all([
    repo.listGraduates(importId),
    repo.listSourceOrders(importId),
  ]);

  const ordersByGraduate = new Map<string, PreviewSourceOrder[]>();
  const rejected: PreviewSourceOrder[] = [];
  for (const row of orders) {
    const view = toPreviewOrder(row);
    if (row.graduate_id === null) {
      rejected.push(view);
      continue;
    }
    const bucket = ordersByGraduate.get(row.graduate_id) ?? [];
    bucket.push(view);
    ordersByGraduate.set(row.graduate_id, bucket);
  }

  return {
    ok: true,
    data: {
      summary: toSummary(importRecord),
      graduates: graduates.map((row) =>
        toPreviewGraduate(row, ordersByGraduate.get(row.id) ?? [])
      ),
      rejected,
    },
  };
}

export async function listProductionImportHistory(
  actor: StaffSession
): Promise<ServiceResult<ProductionImportSummary[]>> {
  if (!canImportRegistrations(actor.role)) {
    return accessFailure();
  }
  const eventResolution = await resolveActiveEvent();
  if (!eventResolution.ok) {
    return { ok: true, data: [] };
  }
  const rows = await repo.listProductionImports(eventResolution.event.id);
  return { ok: true, data: rows.map(toSummary) };
}

// ---------------------------------------------------------------------
// Administrator reconciliation decisions
// ---------------------------------------------------------------------

/**
 * Records the administrator's decision for one reconciled graduate.
 *
 * Approving a party larger than the payment supports is permitted, because
 * an administrator may hold an approved exception the workbook cannot show.
 * It always requires a reconciliation note, so the override is recorded.
 */
export async function reconcileGraduate(
  actor: StaffSession,
  importId: string,
  graduateId: string,
  input: ReconcileGraduateInput
): Promise<ServiceResult<{ decision: string }>> {
  if (!canImportRegistrations(actor.role)) {
    return accessFailure();
  }

  const importRecord = await repo.getProductionImport(importId);
  if (importRecord === null) {
    return failure(404, "import_not_found", "The import was not found.");
  }
  if (importRecord.status !== "preview_ready") {
    return failure(
      409,
      "import_not_editable",
      "Only an import awaiting review can be reconciled."
    );
  }

  const graduate = await repo.getGraduate(importId, graduateId);
  if (graduate === null) {
    return failure(404, "graduate_not_found", "The graduate was not found.");
  }

  const reasons = parseReviewReasons(graduate.review_reasons);
  const overridesBlockingReason =
    input.decision === "approved" &&
    reasons.some((entry) => entry.blocking) &&
    (input.reconciliationNote ?? "").trim().length < 5;
  if (overridesBlockingReason) {
    return failure(
      422,
      "override_reason_required",
      "Approving a graduate that needs review requires a reconciliation " +
        "note explaining the decision."
    );
  }

  await repo.updateGraduate(graduateId, {
    decision: input.decision,
    canonical_full_name:
      input.canonicalFullName ?? graduate.canonical_full_name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    gown_size: input.gownSize ?? null,
    name_pronunciation: input.namePronunciation ?? null,
    approved_adult_guests: input.approvedAdultGuests,
    approved_children_0_4: input.approvedChildren04,
    approved_children_5_10: input.approvedChildren510,
    approved_adult_guest_names: input.approvedAdultGuestNames,
    reconciliation_note: input.reconciliationNote ?? null,
  });

  await refreshCounts(importId);

  return { ok: true, data: { decision: input.decision } };
}

/** Recomputes the stored preview counts after an administrator edit. */
async function refreshCounts(importId: string): Promise<void> {
  const [graduates, orders] = await Promise.all([
    repo.listGraduates(importId),
    repo.listSourceOrders(importId),
  ]);
  const needsReview = graduates.filter(
    (row) => row.decision === "needs_review"
  ).length;
  const excluded = graduates.filter((row) => row.decision === "excluded").length;
  await repo.updateProductionImport(importId, {
    graduate_count: graduates.length,
    needs_review_count: needsReview,
    excluded_count: excluded,
    expected_ticket_count: graduates.length - excluded,
    duplicate_submission_count: orders.filter(
      (row) => row.order_role === "duplicate_submission"
    ).length,
    supplemental_order_count: orders.filter(
      (row) => row.order_role === "supplemental"
    ).length,
    source_order_count: orders.length,
  });
}

export async function cancelProductionImport(
  actor: StaffSession,
  importId: string
): Promise<ServiceResult<{ status: "cancelled" }>> {
  if (!canImportRegistrations(actor.role)) {
    return accessFailure();
  }
  const importRecord = await repo.getProductionImport(importId);
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
      "Only an import awaiting review can be cancelled."
    );
  }
  await repo.setProductionImportStatus(importId, "cancelled");
  return { ok: true, data: { status: "cancelled" } };
}
