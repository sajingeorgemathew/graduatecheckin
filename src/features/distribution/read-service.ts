import "server-only";

/**
 * Read model for the Distribution Control Centre. Resolves the active event,
 * then builds dashboard counts, per-batch summaries, batch details, attempt
 * history and result-import history. Test and production are counted and
 * labelled separately throughout. Recipient emails are administrator-only and
 * only appear in the detail shapes, never in list summaries.
 */

import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import { listBatches as listDocumentBatches } from "@/features/ticket-documents/repository";

import type { DeliveryMode, DeliveryPurpose } from "./constants";
import {
  attemptDisplayOutcome,
  deriveLatestModeOutcomes,
  type ModeOutcome,
} from "./outcome-display";
import { distributionSecretStatus } from "./secret";
import * as repo from "./repository";
import {
  emptyDashboardCounts,
  summarizeDeliveries,
  type DeliveryCountInput,
  type DistributionDashboardCounts,
} from "./summaries";
import type { DeliveryAttemptOutcome } from "./types";

// ---- Shared view shapes ------------------------------------------------

export interface BatchRowView {
  id: string;
  code: string;
  eventCode: string;
  eventTitle: string;
  mode: DeliveryMode;
  purpose: DeliveryPurpose;
  status: string;
  totalDeliveries: number;
  preparedCount: number;
  testSentCount: number;
  productionSentCount: number;
  failedCount: number;
  createdAt: string;
  lastActivityAt: string;
}

export interface ResultImportRowView {
  id: string;
  fileName: string;
  batchCode: string;
  status: string;
  totalRows: number;
  acceptedRows: number;
  duplicateRows: number;
  warningRows: number;
  rejectedRows: number;
  importedBy: string;
  importedAt: string | null;
}

export interface DistributionAdminData {
  eventName: string;
  eventCode: string;
  eventIsTest: boolean;
  distributionConfigured: boolean;
  counts: DistributionDashboardCounts;
  batches: BatchRowView[];
  resultImports: ResultImportRowView[];
  sourceDocumentBatches: Array<{
    id: string;
    code: string;
    status: string;
    readyCount: number;
    createdAt: string;
  }>;
}

export type DistributionAdminResult =
  | { ok: true; data: DistributionAdminData }
  | { ok: false; message: string };

function laterOf(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

// ---- Control Centre overview -------------------------------------------

export async function loadDistributionAdminData(): Promise<DistributionAdminResult> {
  const event = await resolveActiveEvent();
  if (!event.ok) {
    return {
      ok: false,
      message: "The configured graduation event is not available.",
    };
  }

  const [deliveries, batches, resultImports, documentBatches] = await Promise.all([
    repo.listEventDeliveries(event.event.id),
    repo.listDeliveryBatches(event.event.id),
    repo.listResultImportsForEvent(event.event.id),
    listDocumentBatches(event.event.id),
  ]);

  const attemptsByDelivery = await repo.listAttemptsByDeliveryIds(
    deliveries.map((row) => row.id)
  );
  const modeByBatch = new Map(batches.map((batch) => [batch.id, batch.mode]));

  // One enriched count-input per delivery, resolving latest test/production
  // outcomes from attempt history.
  const countInputs: DeliveryCountInput[] = [];
  const perBatchInputs = new Map<string, DeliveryCountInput[]>();
  const lastActivityByBatch = new Map<string, string | null>();

  for (const delivery of deliveries) {
    const attempts = attemptsByDelivery.get(delivery.id) ?? [];
    const latest = deriveLatestModeOutcomes(
      attempts.map<ModeOutcome>((attempt) => ({
        mode: attempt.mode,
        outcome: attempt.outcome,
        attemptNumber: attempt.attempt_number,
      }))
    );
    const input: DeliveryCountInput = {
      status: delivery.status,
      mode: modeByBatch.get(delivery.delivery_batch_id) ?? "production",
      latestTestOutcome: latest.latestTestOutcome,
      latestProductionOutcome: latest.latestProductionOutcome,
    };
    countInputs.push(input);
    const bucket = perBatchInputs.get(delivery.delivery_batch_id);
    if (bucket === undefined) {
      perBatchInputs.set(delivery.delivery_batch_id, [input]);
    } else {
      bucket.push(input);
    }
    lastActivityByBatch.set(
      delivery.delivery_batch_id,
      laterOf(
        lastActivityByBatch.get(delivery.delivery_batch_id) ?? null,
        delivery.last_attempt_at
      )
    );
  }

  const eventTitle = event.event.event_name;
  const eventCode = event.event.event_code;

  const batchViews: BatchRowView[] = batches.map((batch) => {
    const inputs = perBatchInputs.get(batch.id) ?? [];
    const counts = summarizeDeliveries(inputs);
    const lastActivity =
      laterOf(
        laterOf(lastActivityByBatch.get(batch.id) ?? null, batch.results_imported_at),
        laterOf(batch.prepared_at, batch.created_at)
      ) ?? batch.created_at;
    return {
      id: batch.id,
      code: batch.delivery_batch_code,
      eventCode,
      eventTitle,
      mode: batch.mode,
      purpose: batch.purpose,
      status: batch.status,
      totalDeliveries: counts.totalDeliveries,
      preparedCount: counts.prepared,
      testSentCount: counts.testSent,
      productionSentCount: counts.productionSent,
      failedCount: counts.testFailed + counts.productionFailed,
      createdAt: batch.created_at,
      lastActivityAt: lastActivity,
    };
  });

  const importerNames = await repo.getStaffDisplayNames(
    resultImports.map((row) => row.imported_by ?? "")
  );
  const batchCodeById = new Map(
    batches.map((batch) => [batch.id, batch.delivery_batch_code])
  );
  const resultImportViews: ResultImportRowView[] = resultImports.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    batchCode: batchCodeById.get(row.delivery_batch_id) ?? "",
    status: row.status,
    totalRows: row.total_rows,
    acceptedRows: row.accepted_rows,
    duplicateRows: row.duplicate_rows,
    warningRows: row.warning_rows,
    rejectedRows: row.rejected_rows,
    importedBy: row.imported_by
      ? importerNames.get(row.imported_by) ?? "Administrator"
      : "—",
    importedAt: row.imported_at,
  }));

  const secret = distributionSecretStatus();

  return {
    ok: true,
    data: {
      eventName: eventTitle,
      eventCode,
      eventIsTest: event.event.is_test,
      distributionConfigured: secret.valid,
      counts: deliveries.length === 0 ? emptyDashboardCounts() : summarizeDeliveries(countInputs),
      batches: batchViews,
      resultImports: resultImportViews,
      sourceDocumentBatches: documentBatches
        .filter(
          (batch) => batch.status === "ready" || batch.status === "exported"
        )
        .map((batch) => ({
          id: batch.id,
          code: batch.batch_code,
          status: batch.status,
          readyCount: batch.ready_count,
          createdAt: batch.created_at,
        })),
    },
  };
}

// ---- Batch detail ------------------------------------------------------

export interface AttemptHistoryView {
  attemptReference: string;
  attemptNumber: number;
  mode: DeliveryMode;
  outcome: DeliveryAttemptOutcome;
  displayOutcome: string;
  intendedRecipient: string;
  actualRecipient: string;
  provider: string;
  attemptedAt: string;
  resultImportFile: string;
  errorCode: string;
  errorMessage: string;
}

export interface DeliveryDetailView {
  id: string;
  deliveryReference: string;
  graduateName: string;
  intendedEmail: string;
  ticketCode: string;
  pdfFileName: string;
  status: string;
  latestTestOutcome: string;
  latestProductionOutcome: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  attempts: AttemptHistoryView[];
}

export interface BatchDetailData {
  eventCode: string;
  eventTitle: string;
  eventIsTest: boolean;
  batchCode: string;
  mode: DeliveryMode;
  purpose: DeliveryPurpose;
  status: string;
  createdBy: string;
  createdAt: string;
  preparedAt: string | null;
  lastActivityAt: string | null;
  counts: DistributionDashboardCounts;
  deliveries: DeliveryDetailView[];
  resultImports: ResultImportRowView[];
}

export type BatchDetailResult =
  | { ok: true; data: BatchDetailData }
  | { ok: false; message: string };

function outcomeLabel(outcome: DeliveryAttemptOutcome | null, mode: DeliveryMode): string {
  return outcome === null ? "—" : attemptDisplayOutcome(mode, outcome);
}

export async function loadBatchDetail(
  batchCode: string
): Promise<BatchDetailResult> {
  const batch = await repo.getDeliveryBatchByCode(batchCode);
  if (batch === null) {
    return { ok: false, message: "The delivery batch was not found." };
  }
  const event = await repo.getEventTemplateInfo(batch.event_id);
  if (event === null) {
    return { ok: false, message: "The event was not found." };
  }

  const [deliveries, resultImports] = await Promise.all([
    repo.listDeliveries(batch.id),
    repo.listResultImportsForBatch(batch.id),
  ]);
  const attemptsByDelivery = await repo.listAttemptsByDeliveryIds(
    deliveries.map((row) => row.id)
  );
  const importFileById = new Map(
    resultImports.map((row) => [row.id, row.file_name])
  );

  const countInputs: DeliveryCountInput[] = [];
  let lastActivity: string | null = null;

  const deliveryViews: DeliveryDetailView[] = deliveries.map((delivery) => {
    const attempts = attemptsByDelivery.get(delivery.id) ?? [];
    const latest = deriveLatestModeOutcomes(
      attempts.map<ModeOutcome>((attempt) => ({
        mode: attempt.mode,
        outcome: attempt.outcome,
        attemptNumber: attempt.attempt_number,
      }))
    );
    countInputs.push({
      status: delivery.status,
      mode: batch.mode,
      latestTestOutcome: latest.latestTestOutcome,
      latestProductionOutcome: latest.latestProductionOutcome,
    });
    lastActivity = laterOf(lastActivity, delivery.last_attempt_at);

    // Newest attempt first.
    const attemptViews: AttemptHistoryView[] = attempts
      .slice()
      .sort((a, b) => b.attempt_number - a.attempt_number)
      .map((attempt) => ({
        attemptReference: attempt.attempt_reference,
        attemptNumber: attempt.attempt_number,
        mode: attempt.mode,
        outcome: attempt.outcome,
        displayOutcome: attemptDisplayOutcome(attempt.mode, attempt.outcome),
        intendedRecipient: attempt.intended_recipient_snapshot,
        actualRecipient: attempt.actual_recipient_snapshot ?? "—",
        provider: attempt.provider ?? "—",
        attemptedAt: attempt.attempted_at,
        resultImportFile: attempt.result_import_id
          ? importFileById.get(attempt.result_import_id) ?? "—"
          : "—",
        errorCode: attempt.error_code ?? "",
        errorMessage: attempt.error_message ?? "",
      }));

    return {
      id: delivery.id,
      deliveryReference: delivery.delivery_reference,
      graduateName: delivery.recipient_name_snapshot,
      intendedEmail: delivery.recipient_email_snapshot,
      ticketCode: delivery.ticket_code_snapshot,
      pdfFileName: delivery.pdf_file_name_snapshot,
      status: delivery.status,
      latestTestOutcome: outcomeLabel(latest.latestTestOutcome, "test"),
      latestProductionOutcome: outcomeLabel(
        latest.latestProductionOutcome,
        "production"
      ),
      attemptCount: delivery.attempt_count,
      lastAttemptAt: delivery.last_attempt_at,
      attempts: attemptViews,
    };
  });

  const createdByName = batch.created_by
    ? (await repo.getStaffDisplayNames([batch.created_by])).get(batch.created_by) ??
      "Administrator"
    : "—";

  const batchCodeById = new Map([[batch.id, batch.delivery_batch_code]]);
  const importerNames = await repo.getStaffDisplayNames(
    resultImports.map((row) => row.imported_by ?? "")
  );
  const resultImportViews: ResultImportRowView[] = resultImports.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    batchCode: batchCodeById.get(row.delivery_batch_id) ?? batch.delivery_batch_code,
    status: row.status,
    totalRows: row.total_rows,
    acceptedRows: row.accepted_rows,
    duplicateRows: row.duplicate_rows,
    warningRows: row.warning_rows,
    rejectedRows: row.rejected_rows,
    importedBy: row.imported_by
      ? importerNames.get(row.imported_by) ?? "Administrator"
      : "—",
    importedAt: row.imported_at,
  }));

  return {
    ok: true,
    data: {
      eventCode: event.event_code,
      eventTitle: event.event_name,
      eventIsTest: event.is_test,
      batchCode: batch.delivery_batch_code,
      mode: batch.mode,
      purpose: batch.purpose,
      status: batch.status,
      createdBy: createdByName,
      createdAt: batch.created_at,
      preparedAt: batch.prepared_at,
      lastActivityAt:
        laterOf(lastActivity, laterOf(batch.results_imported_at, batch.prepared_at)) ??
        batch.created_at,
      counts: summarizeDeliveries(countInputs),
      deliveries: deliveryViews,
      resultImports: resultImportViews,
    },
  };
}

// ---- Result-import detail ---------------------------------------------

export interface ImportLineView {
  rowNumber: number;
  deliveryReference: string;
  attemptReference: string;
  disposition: string;
  mode: string;
  outcome: string;
  reason: string;
}

export interface ImportDetailData {
  import: ResultImportRowView;
  lines: ImportLineView[];
}

export type ImportDetailResult =
  | { ok: true; data: ImportDetailData }
  | { ok: false; message: string };

export async function loadImportDetail(
  importId: string
): Promise<ImportDetailResult> {
  const record = await repo.getResultImport(importId);
  if (record === null) {
    return { ok: false, message: "The result import was not found." };
  }
  const [lines, batch, importerNames] = await Promise.all([
    repo.listResultImportLines(importId),
    repo.getDeliveryBatch(record.delivery_batch_id),
    repo.getStaffDisplayNames([record.imported_by ?? ""]),
  ]);

  return {
    ok: true,
    data: {
      import: {
        id: record.id,
        fileName: record.file_name,
        batchCode: batch?.delivery_batch_code ?? "",
        status: record.status,
        totalRows: record.total_rows,
        acceptedRows: record.accepted_rows,
        duplicateRows: record.duplicate_rows,
        warningRows: record.warning_rows,
        rejectedRows: record.rejected_rows,
        importedBy: record.imported_by
          ? importerNames.get(record.imported_by) ?? "Administrator"
          : "—",
        importedAt: record.imported_at,
      },
      lines: lines.map((line) => ({
        rowNumber: line.row_number,
        deliveryReference: line.delivery_reference,
        attemptReference: line.attempt_reference,
        disposition: line.disposition,
        mode: line.mode ?? "—",
        outcome: line.outcome ?? "—",
        reason: line.reason_code ? `${line.reason_code}: ${line.message}` : line.message,
      })),
    },
  };
}
