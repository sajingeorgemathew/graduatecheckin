import "server-only";

/**
 * CHECKIN-10A production cutover services.
 *
 * Two responsibilities:
 *   1. Recording that a ticket reached a graduate outside this system. This
 *      is an audit record only. It creates no delivery, no attempt and no
 *      Apps Script row, so the application never claims to have sent an email
 *      it did not send. It does affect initial-batch eligibility.
 *   2. Building the production eligibility preview and the production
 *      progress panel from live data.
 *
 * Nothing here sends email or contacts Gmail.
 */

import { resolveActiveEvent } from "@/features/events/resolve-active-event";

import { PRODUCTION_EVENT_CODE, type ExternalDeliveryChannel } from "./constants";
import {
  summarizeProductionEligibility,
  type ProductionEligibilityDecision,
  type ProductionEligibilityInput,
  type ProductionEligibilitySummary,
} from "./production-eligibility";
import * as repo from "./repository";

export type ProductionServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

function fail(code: string, message: string): { ok: false; code: string; message: string } {
  return { ok: false, code, message };
}

// ---- Previously sent outside the system --------------------------------

export interface RecordExternalDeliveryInput {
  actorUserId: string;
  registrationId: string;
  documentReference: string;
  previousSendDate: string;
  channel: ExternalDeliveryChannel;
  note: string;
}

export async function recordExternalDelivery(
  input: RecordExternalDeliveryInput
): Promise<ProductionServiceResult<{ externalDeliveryId: string }>> {
  const event = await resolveActiveEvent();
  if (!event.ok) {
    return fail(
      "event_not_available",
      "The configured graduation event is not available."
    );
  }

  const registrations = await repo.getRegistrationsByIds([input.registrationId]);
  const registration = registrations.get(input.registrationId) ?? null;
  if (registration === null || registration.event_id !== event.event.id) {
    return fail(
      "registration_not_found",
      "The registration was not found in the active event."
    );
  }

  const parsedDate = new Date(input.previousSendDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return fail("invalid_date", "Provide a valid previous send date.");
  }

  const ticketStates = await repo.listRegistrationTicketStates([
    input.registrationId,
  ]);
  const ticket = ticketStates.get(input.registrationId) ?? null;

  const record = await repo.insertExternalDelivery({
    event_id: event.event.id,
    registration_id: input.registrationId,
    ticket_id: ticket?.ticketId ?? null,
    document_reference: input.documentReference.trim(),
    previous_send_date: parsedDate.toISOString().slice(0, 10),
    channel: input.channel,
    note: input.note.trim(),
    recorded_by: input.actorUserId,
  });

  return { ok: true, data: { externalDeliveryId: record.id } };
}

// ---- Production eligibility preview and progress -----------------------

export interface ExternalDeliveryView {
  id: string;
  graduateName: string;
  documentReference: string;
  previousSendDate: string;
  channel: string;
  recordedBy: string;
  recordedAt: string;
  note: string;
}

export interface ProductionProgress {
  totalDeliveries: number;
  productionSent: number;
  failed: number;
  bounced: number;
  resendRequired: number;
  remainingPrepared: number;
  lastRunAttempted: number;
  lastRunSent: number;
  lastRunFailed: number;
  lastResultsImportedAt: string | null;
  lastSendAttemptAt: string | null;
  /**
   * Deliveries that have been prepared and exported but whose results have
   * not come back yet. The application cannot see the workbook, so this is
   * the honest application-side view: prepared rows in a batch that has never
   * had results imported.
   */
  awaitingResultImport: number;
}

export interface ProductionOverviewData {
  eventCode: string;
  eventTitle: string;
  eventIsTest: boolean;
  isProductionEvent: boolean;
  summary: ProductionEligibilitySummary;
  decisions: ProductionEligibilityDecision[];
  progress: ProductionProgress;
  externalDeliveries: ExternalDeliveryView[];
  registrations: Array<{ id: string; name: string }>;
}

export type ProductionOverviewResult =
  | { ok: true; data: ProductionOverviewData }
  | { ok: false; message: string };

export async function loadProductionOverview(): Promise<ProductionOverviewResult> {
  const event = await resolveActiveEvent();
  if (!event.ok) {
    return {
      ok: false,
      message: "The configured graduation event is not available.",
    };
  }
  const eventId = event.event.id;

  const [
    registrations,
    externalRecords,
    productionSent,
    productionFailed,
    openProduction,
    documented,
    deliveries,
    batches,
  ] = await Promise.all([
    repo.listEventRegistrations(eventId),
    repo.listExternalDeliveries(eventId),
    repo.listProductionSentRegistrations(eventId),
    repo.listProductionFailedRegistrations(eventId),
    repo.listRegistrationsInOpenProductionBatches(eventId),
    repo.listRegistrationsWithCurrentDocument(eventId),
    repo.listEventDeliveries(eventId),
    repo.listDeliveryBatches(eventId),
  ]);

  const externalIds = new Set(
    externalRecords.map((record) => record.registration_id)
  );
  const ticketStates = await repo.listRegistrationTicketStates(
    registrations.map((row) => row.id)
  );

  const inputs: ProductionEligibilityInput[] = registrations.map((row) => ({
    registrationId: row.id,
    graduateName: row.graduate_full_name,
    registrationStatus: row.registration_status,
    email: row.email,
    ticketStatus: ticketStates.get(row.id)?.status ?? null,
    hasCurrentDocument: documented.has(row.id),
    productionSent: productionSent.has(row.id),
    externallySent: externalIds.has(row.id),
    inOpenProductionBatch: openProduction.has(row.id),
    productionFailed: productionFailed.has(row.id),
    suppressed: false,
  }));

  const { summary, decisions } = summarizeProductionEligibility(inputs);

  // Progress is counted from production-mode batches only, so test counters
  // and production counters never merge.
  const productionBatchIds = new Set(
    batches.filter((batch) => batch.mode === "production").map((b) => b.id)
  );
  const productionDeliveries = deliveries.filter((row) =>
    productionBatchIds.has(row.delivery_batch_id)
  );

  const batchesWithoutImport = new Set(
    batches
      .filter(
        (batch) =>
          batch.mode === "production" && batch.results_imported_at === null
      )
      .map((batch) => batch.id)
  );

  const progress: ProductionProgress = {
    totalDeliveries: productionDeliveries.length,
    productionSent: productionDeliveries.filter(
      (row) => row.status === "sent" || row.status === "resent"
    ).length,
    failed: productionDeliveries.filter((row) => row.status === "failed").length,
    bounced: productionDeliveries.filter(
      (row) => row.status === "bounce_detected"
    ).length,
    resendRequired: productionDeliveries.filter(
      (row) => row.status === "resend_required"
    ).length,
    remainingPrepared: productionDeliveries.filter(
      (row) => row.status === "prepared"
    ).length,
    lastRunAttempted: 0,
    lastRunSent: 0,
    lastRunFailed: 0,
    lastResultsImportedAt: null,
    lastSendAttemptAt: null,
    awaitingResultImport: productionDeliveries.filter(
      (row) =>
        row.status === "prepared" && batchesWithoutImport.has(row.delivery_batch_id)
    ).length,
  };

  // "Last run" is the most recent production batch that has any attempt
  // history, reported from the imported results only.
  const latestBatch = batches
    .filter((batch) => batch.mode === "production")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  if (latestBatch !== undefined) {
    const rows = productionDeliveries.filter(
      (row) => row.delivery_batch_id === latestBatch.id
    );
    progress.lastRunAttempted = rows.filter((row) => row.attempt_count > 0).length;
    progress.lastRunSent = rows.filter(
      (row) => row.status === "sent" || row.status === "resent"
    ).length;
    progress.lastRunFailed = rows.filter(
      (row) => row.status === "failed" || row.status === "bounce_detected"
    ).length;
    progress.lastResultsImportedAt = latestBatch.results_imported_at;
    progress.lastSendAttemptAt = rows.reduce<string | null>(
      (latest, row) =>
        row.last_attempt_at !== null &&
        (latest === null || row.last_attempt_at > latest)
          ? row.last_attempt_at
          : latest,
      null
    );
  }

  const nameById = new Map(
    registrations.map((row) => [row.id, row.graduate_full_name] as const)
  );
  const recorderNames = await repo.getStaffDisplayNames(
    externalRecords.map((row) => row.recorded_by ?? "")
  );

  return {
    ok: true,
    data: {
      eventCode: event.event.event_code,
      eventTitle: event.event.event_name,
      eventIsTest: event.event.is_test,
      isProductionEvent: event.event.event_code === PRODUCTION_EVENT_CODE,
      summary,
      decisions,
      progress,
      externalDeliveries: externalRecords.map((record) => ({
        id: record.id,
        graduateName: nameById.get(record.registration_id) ?? "—",
        documentReference: record.document_reference,
        previousSendDate: record.previous_send_date,
        channel: record.channel,
        recordedBy: record.recorded_by
          ? recorderNames.get(record.recorded_by) ?? "Administrator"
          : "—",
        recordedAt: record.recorded_at,
        note: record.note,
      })),
      registrations: registrations.map((row) => ({
        id: row.id,
        name: row.graduate_full_name,
      })),
    },
  };
}
