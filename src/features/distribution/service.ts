import "server-only";

/**
 * Distribution service for CHECKIN-09B.
 *
 * Prepares delivery batches from completed PDF document batches, builds the
 * signed send-queue export, imports Apps Script results into append-only
 * attempt history and cancels unsent batches. The application never sends
 * email and never contacts Gmail; it only prepares and records.
 */

import { createHash } from "node:crypto";

import type { Json } from "@/types/database";

import {
  MAX_RESULT_CSV_BYTES,
  type DeliveryMode,
  type DeliveryPurpose,
} from "./constants";
import { mapResultOutcome } from "./outcome-mapping";
import {
  readPartySnapshot,
  writePartySnapshot,
} from "./party-audit";
import {
  evaluateDeliveryEligibility,
  type EligibilityDocument,
} from "./preparation-rules";
import {
  generateDeliveryBatchCode,
  generateDeliveryReference,
} from "./references";
import * as repo from "./repository";
import {
  evaluateResultRows,
  parseResultCsv,
  type KnownDelivery,
} from "./results";
import { signDeliveryRow, type DeliverySignaturePayload } from "./signing";
import { buildSendQueueCsv } from "./send-queue";
import { summarizeDeliveries } from "./summaries";
import type {
  DeliveryParty,
  ExcludedDelivery,
  PreparedDeliveryRow,
  ResultImportSummary,
} from "./types";

export type DistributionServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

function fail(code: string, message: string): { ok: false; code: string; message: string } {
  return { ok: false, code, message };
}

function signaturePayloadFor(row: {
  deliveryReference: string;
  deliveryBatchCode: string;
  eventCode: string;
  deliveryMode: DeliveryMode;
  deliveryPurpose: DeliveryPurpose;
  intendedRecipientEmail: string;
  ticketCode: string;
  documentVersion: number;
  pdfFileName: string;
  pdfSha256: string;
  party: DeliveryParty;
}): DeliverySignaturePayload {
  return {
    deliveryReference: row.deliveryReference,
    deliveryBatchCode: row.deliveryBatchCode,
    eventCode: row.eventCode,
    deliveryMode: row.deliveryMode,
    deliveryPurpose: row.deliveryPurpose,
    intendedRecipientEmail: row.intendedRecipientEmail,
    ticketCode: row.ticketCode,
    documentVersion: row.documentVersion,
    pdfFileName: row.pdfFileName,
    pdfSha256: row.pdfSha256,
    totalPartyCount: row.party.totalPartyCount,
  };
}

export interface PrepareBatchResult {
  deliveryBatchId: string;
  deliveryBatchCode: string;
  mode: DeliveryMode;
  purpose: DeliveryPurpose;
  preparedCount: number;
  excluded: ExcludedDelivery[];
}

export async function prepareDeliveryBatch(input: {
  actorUserId: string;
  documentBatchId: string;
  mode: DeliveryMode;
  purpose: DeliveryPurpose;
  allowTestRecipientOverride: boolean;
  secret: string;
}): Promise<DistributionServiceResult<PrepareBatchResult>> {
  const documentBatch = await repo.getDocumentBatch(input.documentBatchId);
  if (documentBatch === null) {
    return fail("document_batch_not_found", "The document batch was not found.");
  }
  if (
    documentBatch.status !== "ready" &&
    documentBatch.status !== "exported"
  ) {
    return fail(
      "document_batch_not_ready",
      "Only a completed (ready or exported) document batch can be distributed."
    );
  }

  const event = await repo.getEventTemplateInfo(documentBatch.event_id);
  if (event === null) {
    return fail("event_not_found", "The event was not found.");
  }
  if (event.status === "closed" || event.status === "archived") {
    return fail("event_not_open", "The event is closed or archived.");
  }

  // Batch-level mode/event guard so an obviously wrong combination is
  // rejected before any row is prepared.
  if (input.mode === "production" && event.is_test) {
    return fail(
      "mode_event_mismatch",
      "Production mode cannot target a test event."
    );
  }
  if (
    input.mode === "test" &&
    !event.is_test &&
    !input.allowTestRecipientOverride
  ) {
    return fail(
      "mode_event_mismatch",
      "Test mode against a production event requires the internal test-recipient override."
    );
  }

  const items = (await repo.listDocumentBatchItems(input.documentBatchId)).filter(
    (item) => item.item_status === "ready"
  );
  const registrationIds = [...new Set(items.map((item) => item.registration_id))];

  const [registrations, tickets, alreadyBatched] = await Promise.all([
    repo.getRegistrationsByIds(registrationIds),
    repo.getActiveTicketsByRegistrationIds(registrationIds),
    repo.listRegistrationsInDeliveryBatches(documentBatch.event_id),
  ]);
  const ticketIds = [...tickets.values()].map((ticket) => ticket.id);
  const documents = await repo.getCurrentDocumentsByTicketIds(ticketIds);

  const deliveryBatchCode = generateDeliveryBatchCode();
  const preparedAt = new Date().toISOString();
  const excluded: ExcludedDelivery[] = [];
  const prepared: PreparedDeliveryRow[] = [];

  for (const item of items) {
    const registration = registrations.get(item.registration_id) ?? null;
    if (registration === null) {
      excluded.push({
        registrationId: item.registration_id,
        graduateName: item.recipient_name_snapshot,
        reason: "registration_ineligible",
      });
      continue;
    }
    const ticket = tickets.get(item.registration_id) ?? null;
    const document = ticket ? documents.get(ticket.id) ?? null : null;
    const eligibilityDocument: EligibilityDocument | null = document
      ? {
          id: document.id,
          eventId: document.event_id,
          registrationId: document.registration_id,
          ticketId: document.ticket_id,
          status: document.status,
          templateVersion: document.template_version,
          sha256Checksum: document.sha256_checksum,
        }
      : null;

    const eligibility = evaluateDeliveryEligibility({
      mode: input.mode,
      eventId: documentBatch.event_id,
      eventIsTest: event.is_test,
      allowTestRecipientOverride: input.allowTestRecipientOverride,
      currentTemplateVersion: event.templateVersion,
      registration: {
        id: registration.id,
        eventId: registration.event_id,
        registrationStatus: registration.registration_status,
        email: registration.email,
      },
      ticket: ticket
        ? { id: ticket.id, registrationId: ticket.registration_id, status: ticket.status }
        : null,
      document: eligibilityDocument,
      alreadyBatched: alreadyBatched.has(registration.id),
    });

    if (!eligibility.ok) {
      excluded.push({
        registrationId: registration.id,
        graduateName: registration.graduate_full_name,
        reason: eligibility.reason,
      });
      continue;
    }

    // eligibility.ok guarantees ticket and document are present.
    const activeTicket = ticket!;
    const currentDocument = document!;
    const party = readPartySnapshot(currentDocument.registered_party_snapshot);
    const intendedEmail = (registration.email ?? "").trim();
    const deliveryReference = generateDeliveryReference();

    const rowCore = {
      deliveryReference,
      deliveryBatchCode,
      eventCode: event.event_code,
      deliveryMode: input.mode,
      deliveryPurpose: input.purpose,
      intendedRecipientEmail: intendedEmail,
      ticketCode: currentDocument.ticket_code_snapshot,
      documentVersion: currentDocument.document_version,
      pdfFileName: currentDocument.file_name,
      pdfSha256: currentDocument.sha256_checksum,
      party,
    };
    const rowSignature = signDeliveryRow(
      signaturePayloadFor(rowCore),
      input.secret
    );

    prepared.push({
      ...rowCore,
      rowSignature,
      registrationId: registration.id,
      ticketId: activeTicket.id,
      documentId: currentDocument.id,
      eventTitle: event.event_name,
      graduateName: registration.graduate_full_name,
      documentGeneratedAt: currentDocument.generated_at,
      deliveryPreparedAt: preparedAt,
    });
  }

  const batch = await repo.insertDeliveryBatch({
    event_id: documentBatch.event_id,
    document_batch_id: documentBatch.id,
    delivery_batch_code: deliveryBatchCode,
    mode: input.mode,
    purpose: input.purpose,
    status: "prepared",
    prepared_count: prepared.length,
    source_manifest_sha256: documentBatch.manifest_sha256,
    prepared_at: preparedAt,
    created_by: input.actorUserId,
  });

  await repo.insertDeliveries(
    prepared.map((row) => ({
      event_id: documentBatch.event_id,
      delivery_batch_id: batch.id,
      registration_id: row.registrationId,
      ticket_id: row.ticketId,
      document_id: row.documentId,
      delivery_reference: row.deliveryReference,
      recipient_name_snapshot: row.graduateName,
      recipient_email_snapshot: row.intendedRecipientEmail,
      ticket_code_snapshot: row.ticketCode,
      document_version_snapshot: row.documentVersion,
      pdf_file_name_snapshot: row.pdfFileName,
      pdf_sha256_snapshot: row.pdfSha256,
      party_snapshot: writePartySnapshot(row.party),
      row_signature: row.rowSignature,
      status: "prepared",
    }))
  );

  return {
    ok: true,
    data: {
      deliveryBatchId: batch.id,
      deliveryBatchCode: deliveryBatchCode,
      mode: input.mode,
      purpose: input.purpose,
      preparedCount: prepared.length,
      excluded,
    },
  };
}

/** Rebuilds the signed send-queue CSV from the persisted deliveries. */
export async function buildSendQueueForBatch(
  batchId: string
): Promise<DistributionServiceResult<{ fileName: string; csv: string }>> {
  const batch = await repo.getDeliveryBatch(batchId);
  if (batch === null) {
    return fail("batch_not_found", "The delivery batch was not found.");
  }
  const event = await repo.getEventTemplateInfo(batch.event_id);
  if (event === null) {
    return fail("event_not_found", "The event was not found.");
  }
  const deliveries = await repo.listDeliveries(batchId);
  const rows: PreparedDeliveryRow[] = deliveries.map((delivery) => {
    const party = readPartySnapshot(delivery.party_snapshot);
    return {
      deliveryReference: delivery.delivery_reference,
      rowSignature: delivery.row_signature,
      registrationId: delivery.registration_id,
      ticketId: delivery.ticket_id ?? "",
      documentId: delivery.document_id ?? "",
      eventCode: event.event_code,
      eventTitle: event.event_name,
      deliveryBatchCode: batch.delivery_batch_code,
      deliveryMode: batch.mode,
      deliveryPurpose: batch.purpose,
      graduateName: delivery.recipient_name_snapshot,
      intendedRecipientEmail: delivery.recipient_email_snapshot,
      ticketCode: delivery.ticket_code_snapshot,
      documentVersion: delivery.document_version_snapshot,
      pdfFileName: delivery.pdf_file_name_snapshot,
      pdfSha256: delivery.pdf_sha256_snapshot,
      party,
      documentGeneratedAt: "",
      deliveryPreparedAt: batch.prepared_at ?? batch.created_at,
    };
  });
  return {
    ok: true,
    data: {
      fileName: `send-queue-${batch.delivery_batch_code}.csv`,
      csv: buildSendQueueCsv(rows),
    },
  };
}

// ---- Results import ---------------------------------------------------

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function buildKnownDeliveryMap(
  batchId: string,
  eventCode: string,
  mode: DeliveryMode,
  purpose: DeliveryPurpose
): Promise<Map<string, KnownDelivery>> {
  const deliveries = await repo.listDeliveries(batchId);
  const batch = await repo.getDeliveryBatch(batchId);
  const code = batch?.delivery_batch_code ?? "";
  const map = new Map<string, KnownDelivery>();
  for (const delivery of deliveries) {
    const party = readPartySnapshot(delivery.party_snapshot);
    map.set(delivery.delivery_reference, {
      deliveryReference: delivery.delivery_reference,
      deliveryBatchCode: code,
      eventCode,
      mode,
      intendedRecipientEmail: delivery.recipient_email_snapshot,
      pdfSha256: delivery.pdf_sha256_snapshot,
      signaturePayload: {
        deliveryReference: delivery.delivery_reference,
        deliveryBatchCode: code,
        eventCode,
        deliveryMode: mode,
        deliveryPurpose: purpose,
        intendedRecipientEmail: delivery.recipient_email_snapshot,
        ticketCode: delivery.ticket_code_snapshot,
        documentVersion: delivery.document_version_snapshot,
        pdfFileName: delivery.pdf_file_name_snapshot,
        pdfSha256: delivery.pdf_sha256_snapshot,
        totalPartyCount: party.totalPartyCount,
      },
    });
  }
  return map;
}

export interface ResultPreview {
  fileSha256: string;
  alreadyApplied: boolean;
  summary: ResultImportSummary;
  rows: ReturnType<typeof evaluateResultRows>["rows"];
}

export async function previewResults(input: {
  deliveryBatchId: string;
  csv: string;
  secret: string;
}): Promise<DistributionServiceResult<ResultPreview>> {
  if (input.csv.length > MAX_RESULT_CSV_BYTES) {
    return fail("file_too_large", "The results file exceeds the size limit.");
  }
  const batch = await repo.getDeliveryBatch(input.deliveryBatchId);
  if (batch === null) {
    return fail("batch_not_found", "The delivery batch was not found.");
  }
  const event = await repo.getEventTemplateInfo(batch.event_id);
  if (event === null) {
    return fail("event_not_found", "The event was not found.");
  }

  const fileSha256 = sha256(input.csv);
  const alreadyApplied =
    (await repo.findAppliedResultImport(batch.id, fileSha256)) !== null;

  const parsed = parseResultCsv(input.csv);
  if (!parsed.ok) {
    return fail("invalid_results_file", parsed.message);
  }

  const known = await buildKnownDeliveryMap(
    batch.id,
    event.event_code,
    batch.mode,
    batch.purpose
  );
  const existingAttempts = await repo.listAttemptReferencesForBatch(batch.id);

  const evaluated = evaluateResultRows(parsed.rows, {
    knownDeliveries: known,
    existingAttemptReferences: existingAttempts,
    expectedBatchCode: batch.delivery_batch_code,
    expectedEventCode: event.event_code,
    distributionSecret: input.secret,
  });

  return {
    ok: true,
    data: {
      fileSha256,
      alreadyApplied,
      summary: evaluated.summary,
      rows: evaluated.rows,
    },
  };
}

export interface ApplyResultsOutput {
  resultImportId: string;
  summary: ResultImportSummary;
  alreadyApplied: boolean;
}

export async function applyResults(input: {
  actorUserId: string;
  deliveryBatchId: string;
  fileName: string;
  csv: string;
  secret: string;
}): Promise<DistributionServiceResult<ApplyResultsOutput>> {
  const preview = await previewResults({
    deliveryBatchId: input.deliveryBatchId,
    csv: input.csv,
    secret: input.secret,
  });
  if (!preview.ok) {
    return preview;
  }

  const batch = await repo.getDeliveryBatch(input.deliveryBatchId);
  if (batch === null) {
    return fail("batch_not_found", "The delivery batch was not found.");
  }

  // A second import of the same file is idempotent: record nothing new.
  if (preview.data.alreadyApplied) {
    return {
      ok: true,
      data: {
        resultImportId: "",
        summary: preview.data.summary,
        alreadyApplied: true,
      },
    };
  }

  const resultImport = await repo.insertResultImport({
    event_id: batch.event_id,
    delivery_batch_id: batch.id,
    file_name: input.fileName,
    file_sha256: preview.data.fileSha256,
    status: "previewed",
    total_rows: preview.data.summary.totalRows,
    accepted_rows: preview.data.summary.acceptedRows,
    duplicate_rows: preview.data.summary.duplicateRows,
    warning_rows: preview.data.summary.warningRows,
    rejected_rows: preview.data.summary.rejectedRows,
    imported_by: input.actorUserId,
  });

  // Re-map delivery references to delivery ids for the attempt append.
  const deliveries = await repo.listDeliveries(batch.id);
  const idByReference = new Map(
    deliveries.map((row) => [row.delivery_reference, row.id] as const)
  );

  for (const row of preview.data.rows) {
    if (row.disposition !== "accepted" && row.disposition !== "warning") {
      continue;
    }
    if (row.outcome === null || row.mode === null) {
      continue;
    }
    const deliveryId = idByReference.get(row.deliveryReference);
    if (deliveryId === undefined) {
      continue;
    }
    const mapped = mapResultOutcome(row.outcome, row.mode, batch.purpose);
    await repo.recordDeliveryAttemptRpc({
      actorUserId: input.actorUserId,
      deliveryId,
      resultImportId: resultImport.id,
      attemptReference: row.attemptReference,
      mode: mapped.attemptMode,
      outcome: mapped.attemptOutcome,
      intendedRecipient: row.intendedRecipientEmail,
      actualRecipient: row.actualRecipientEmail || null,
      attemptedAt: new Date().toISOString(),
      sentBy: null,
      provider: "google-apps-script",
      errorCode: null,
      errorMessage: row.message || null,
      sourceRowHash: sha256(`${row.deliveryReference}:${row.attemptReference}`),
      newDeliveryStatus: mapped.newDeliveryStatus,
    });
  }

  await repo.updateResultImport(resultImport.id, {
    status: "applied",
    imported_at: new Date().toISOString(),
  });
  await repo.updateDeliveryBatch(batch.id, {
    results_imported_at: new Date().toISOString(),
  });

  return {
    ok: true,
    data: {
      resultImportId: resultImport.id,
      summary: preview.data.summary,
      alreadyApplied: false,
    },
  };
}

export async function cancelDeliveryBatch(
  actorUserId: string,
  batchId: string
): Promise<DistributionServiceResult<{ cancelledCount: number }>> {
  const result = (await repo.cancelDeliveryBatchRpc(actorUserId, batchId)) as {
    ok?: boolean;
    code?: string;
    cancelled_count?: number;
  } | null;
  if (result === null || result.ok !== true) {
    const code = result?.code ?? "cancel_failed";
    return fail(code, "The delivery batch could not be cancelled.");
  }
  return { ok: true, data: { cancelledCount: result.cancelled_count ?? 0 } };
}

export interface DistributionOverview {
  counts: ReturnType<typeof summarizeDeliveries>;
  batches: Array<{
    id: string;
    code: string;
    mode: DeliveryMode;
    purpose: DeliveryPurpose;
    status: string;
    preparedCount: number;
    sentCount: number;
    createdAt: string;
  }>;
}

export async function getDistributionOverview(
  eventId: string
): Promise<DistributionOverview> {
  const [deliveries, batches] = await Promise.all([
    repo.listEventDeliveries(eventId),
    repo.listDeliveryBatches(eventId),
  ]);
  const modeByBatch = new Map(
    batches.map((batch) => [batch.id, batch.mode] as const)
  );
  return {
    counts: summarizeDeliveries(
      deliveries.map((row) => ({
        status: row.status,
        mode: modeByBatch.get(row.delivery_batch_id) ?? "production",
      }))
    ),
    batches: batches.map((batch) => ({
      id: batch.id,
      code: batch.delivery_batch_code,
      mode: batch.mode,
      purpose: batch.purpose,
      status: batch.status,
      preparedCount: batch.prepared_count,
      sentCount: batch.sent_count,
      createdAt: batch.created_at,
    })),
  };
}

export type { Json };
