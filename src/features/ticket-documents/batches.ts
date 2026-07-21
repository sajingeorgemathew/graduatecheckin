import "server-only";

/**
 * Export batch preparation and ZIP packaging.
 *
 * CHECKIN-09A prepares and packages batches. It never sends them: no email,
 * no Gmail API, no Apps Script call and no delivery tracking happens here.
 * The recipient email is captured in the batch snapshot purely so the
 * deferred CHECKIN-09B distribution step has a manifest to work from.
 *
 * A batch is immutable once created. Every item stores a frozen snapshot,
 * so later registration edits never change what a completed batch says or
 * ships.
 *
 * ZIP library: fflate. Chosen because it is actively maintained, has zero
 * transitive dependencies, works on the Node runtime without native
 * bindings, and its synchronous zipSync produces deterministic archives
 * from in-memory buffers, which is what reproducing a batch requires.
 */

import { zipSync, type Zippable } from "fflate";

import type {
  GraduationTicketDocumentBatchItemRow,
  GraduationTicketDocumentBatchRow,
  Json,
} from "@/types/database";

import {
  EXPORT_BATCH_MAX_SIZE,
  TICKET_DOCUMENT_BUCKET,
} from "./constants";
import {
  buildBatchSummary,
  buildManifestCsv,
  manifestChecksum,
} from "./manifest";
import * as repo from "./repository";
import { downloadTicketDocument } from "./storage";
import type {
  ExportManifestRow,
  TicketDocumentBatchPurpose,
} from "./types";

/** Statuses that may never enter a new ready-to-send export batch. */
const EXPORTABLE_DOCUMENT_STATUS = "current";

/**
 * Fixed archive timestamp, so the same batch always produces a
 * byte-identical ZIP.
 *
 * ZIP stores MS-DOS dates, which only cover 1980 to 2099, so the Unix
 * epoch cannot be used. The value is built from local date components
 * rather than a UTC instant for two reasons: a UTC midnight on 1980-01-01
 * falls back into 1979 in any negative-offset timezone and is rejected,
 * and the DOS fields encode local components, so building them locally is
 * what actually makes the bytes identical on every machine.
 */
export const ZIP_FIXED_MTIME = new Date(1980, 0, 2, 12, 0, 0, 0);

export type CreateBatchFailureCode =
  | "no_selection"
  | "too_many_selected"
  | "no_eligible_documents";

export interface CreateBatchInput {
  actorUserId: string;
  eventId: string;
  registrationIds: readonly string[];
  purpose: TicketDocumentBatchPurpose;
}

export type CreateBatchResult =
  | {
      ok: true;
      batchId: string;
      batchCode: string;
      readyCount: number;
      excludedCount: number;
    }
  | { ok: false; code: CreateBatchFailureCode; message: string };

/** Batch codes are opaque, sortable and carry no personal data. */
export function buildBatchCode(now: Date, sequence: number): string {
  const stamp = now
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14);
  return `TAE-EXP-${stamp}-${String(sequence).padStart(2, "0")}`;
}

/**
 * Creates an immutable export batch from the current documents of the
 * selected registrations.
 *
 * Only a document whose status is 'current' is included. A superseded,
 * invalidated, replaced or revoked document is recorded as an excluded item
 * with a reason, so the batch is auditable and the administrator can see
 * exactly what was left out and why.
 */
export async function createExportBatch(
  input: CreateBatchInput
): Promise<CreateBatchResult> {
  const registrationIds = [...new Set(input.registrationIds)];
  if (registrationIds.length === 0) {
    return {
      ok: false,
      code: "no_selection",
      message: "Select at least one registration.",
    };
  }
  if (registrationIds.length > EXPORT_BATCH_MAX_SIZE) {
    return {
      ok: false,
      code: "too_many_selected",
      message: `An export batch holds at most ${EXPORT_BATCH_MAX_SIZE} registrations.`,
    };
  }

  const registrations = await repo.listEventRegistrations(input.eventId);
  const registrationById = new Map(registrations.map((row) => [row.id, row]));
  const activeTickets = await repo.listActiveTicketsByRegistration(
    input.eventId
  );
  const guestsByRegistration = await repo.listGuestsForRegistrations(
    registrationIds
  );
  const documents = await repo.listEventDocuments(input.eventId);
  const currentByTicket = new Map(
    documents
      .filter((doc) => doc.status === EXPORTABLE_DOCUMENT_STATUS)
      .map((doc) => [doc.ticket_id, doc])
  );

  const now = new Date();
  const existingBatches = await repo.listBatches(input.eventId);
  const batchCode = buildBatchCode(now, existingBatches.length + 1);

  const items: Parameters<typeof repo.insertBatchItems>[0] = [];
  let readyCount = 0;
  let excludedCount = 0;

  for (const registrationId of registrationIds) {
    const registration = registrationById.get(registrationId);
    if (registration === undefined) {
      continue;
    }
    const ticket = activeTickets.get(registrationId);
    const document =
      ticket === undefined ? undefined : currentByTicket.get(ticket.id);

    const guests = guestsByRegistration.get(registrationId) ?? [];
    const adultNames = guests
      .filter((guest) => guest.guestCategory === "adult")
      .map((guest) => (guest.guestName ?? "").trim())
      .filter((name) => name.length > 0);

    const party = {
      graduate_count: 1,
      adult_guest_count: registration.registered_adult_guests,
      adult_guest_names: adultNames,
      child_0_4_count: registration.registered_children_0_4,
      child_5_10_count: registration.registered_children_5_10,
      total_party_count: registration.expected_party_size,
    } as unknown as Json;

    if (ticket === undefined) {
      excludedCount += 1;
      items.push({
        batch_id: "",
        registration_id: registrationId,
        item_status: "excluded",
        exclusion_reason: "No active ticket for this registration.",
        recipient_name_snapshot: registration.graduate_full_name,
        recipient_email_snapshot: registration.email,
        party_snapshot: party,
      });
      continue;
    }

    if (document === undefined) {
      excludedCount += 1;
      items.push({
        batch_id: "",
        registration_id: registrationId,
        ticket_id: ticket.id,
        item_status: "excluded",
        exclusion_reason:
          "No current PDF document. Generate or regenerate the PDF first.",
        recipient_name_snapshot: registration.graduate_full_name,
        recipient_email_snapshot: registration.email,
        party_snapshot: party,
      });
      continue;
    }

    readyCount += 1;
    items.push({
      batch_id: "",
      registration_id: registrationId,
      ticket_id: ticket.id,
      document_id: document.id,
      item_status: "ready",
      recipient_name_snapshot: registration.graduate_full_name,
      recipient_email_snapshot: registration.email,
      document_version_snapshot: document.document_version,
      pdf_file_name_snapshot: document.file_name,
      pdf_sha256_snapshot: document.sha256_checksum,
      party_snapshot: document.registered_party_snapshot,
    });
  }

  if (readyCount === 0) {
    return {
      ok: false,
      code: "no_eligible_documents",
      message:
        "None of the selected registrations has a current PDF document.",
    };
  }

  const batch = await repo.insertBatch({
    event_id: input.eventId,
    batch_code: batchCode,
    status: "ready",
    purpose: input.purpose,
    selected_count: registrationIds.length,
    ready_count: readyCount,
    excluded_count: excludedCount,
    failed_count: 0,
    created_by: input.actorUserId,
    completed_at: now.toISOString(),
  });

  await repo.insertBatchItems(
    items.map((item) => ({ ...item, batch_id: batch.id }))
  );

  return {
    ok: true,
    batchId: batch.id,
    batchCode: batch.batch_code,
    readyCount,
    excludedCount,
  };
}

/** Cancels a batch that has not been exported. */
export async function cancelExportBatch(batchId: string): Promise<boolean> {
  const batch = await repo.getBatch(batchId);
  if (batch === null || batch.status === "exported") {
    return false;
  }
  await repo.updateBatch(batchId, {
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
  });
  return true;
}

function manifestRowFor(
  batch: GraduationTicketDocumentBatchRow,
  item: GraduationTicketDocumentBatchItemRow,
  eventTitle: string,
  generatedAt: string
): ExportManifestRow {
  const party = (item.party_snapshot ?? {}) as {
    [key: string]: Json | undefined;
  };
  const names = Array.isArray(party.adult_guest_names)
    ? (party.adult_guest_names as Json[]).filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const numberOr = (value: Json | undefined, fallback: number): number =>
    typeof value === "number" ? value : fallback;

  return {
    batchCode: batch.batch_code,
    exportItemId: item.id,
    eventTitle,
    graduateName: item.recipient_name_snapshot,
    recipientEmail: item.recipient_email_snapshot ?? "",
    ticketCode: (item.pdf_file_name_snapshot ?? "").replace(
      /^TAE-Convocation-2026-(.*)-V\d+\.pdf$/,
      "$1"
    ),
    documentVersion:
      item.document_version_snapshot === null
        ? ""
        : String(item.document_version_snapshot),
    pdfFileName: item.pdf_file_name_snapshot ?? "",
    pdfSha256: item.pdf_sha256_snapshot ?? "",
    graduateCount: String(numberOr(party.graduate_count, 1)),
    adultGuestCount: String(numberOr(party.adult_guest_count, 0)),
    adultGuestNames: names.join("; "),
    child04Count: String(numberOr(party.child_0_4_count, 0)),
    child510Count: String(numberOr(party.child_5_10_count, 0)),
    totalPartyCount: String(numberOr(party.total_party_count, 1)),
    documentGeneratedAt: generatedAt,
    batchCreatedAt: batch.created_at,
    exportPurpose: batch.purpose,
    itemStatus: item.item_status,
  };
}

export interface BatchPackage {
  fileName: string;
  bytes: Buffer;
  manifestSha256: string;
}

/**
 * Builds the downloadable ZIP from the immutable batch snapshot and the
 * private PDF objects.
 *
 * Layout:
 *   <batch-code>/manifest.csv
 *   <batch-code>/batch-summary.txt
 *   <batch-code>/PDFs/TAE-Convocation-2026-<ticket-code>-V<version>.pdf
 *
 * The archive is not stored: it is generated on demand, so the same batch
 * always reproduces the same logical contents.
 */
export async function buildBatchZip(
  batchId: string,
  generatedByRole: string
): Promise<BatchPackage | null> {
  const batch = await repo.getBatch(batchId);
  if (batch === null) {
    return null;
  }
  const event = await repo.getEvent(batch.event_id);
  const eventTitle = event === null ? "" : event.event_name;
  const items = await repo.listBatchItems(batchId);

  const files: Zippable = {};
  const manifestRows: ExportManifestRow[] = [];
  let pdfCount = 0;

  for (const item of items) {
    let generatedAt = "";
    if (item.item_status === "ready" && item.document_id !== null) {
      const document = await repo.getDocument(item.document_id);
      if (document !== null) {
        generatedAt = document.generated_at;
        // Serve the exact stored bytes, never a re-render.
        const bytes = await downloadTicketDocument(document.storage_path);
        files[`${batch.batch_code}/PDFs/${item.pdf_file_name_snapshot}`] =
          new Uint8Array(bytes);
        pdfCount += 1;
      }
    }
    manifestRows.push(manifestRowFor(batch, item, eventTitle, generatedAt));
  }

  const csv = buildManifestCsv(manifestRows);
  const checksum = manifestChecksum(csv);
  const exportedAtIso = new Date().toISOString();

  files[`${batch.batch_code}/manifest.csv`] = new TextEncoder().encode(csv);
  files[`${batch.batch_code}/batch-summary.txt`] = new TextEncoder().encode(
    buildBatchSummary({
      batchCode: batch.batch_code,
      eventTitle,
      purpose: batch.purpose,
      createdAt: batch.created_at,
      exportedAt: exportedAtIso,
      itemCount: items.length,
      pdfCount,
      excludedCount: batch.excluded_count,
      failedCount: batch.failed_count,
      manifestSha256: checksum,
      generatedByRole,
    })
  );

  // mtime is fixed so the same batch produces byte-identical archives.
  // The ZIP format only encodes dates from 1980 to 2099, so the epoch is
  // 1980-01-01 rather than the Unix epoch.
  const zipped = zipSync(files, { level: 6, mtime: ZIP_FIXED_MTIME });

  await repo.updateBatch(batchId, {
    status: "exported",
    exported_at: exportedAtIso,
    manifest_sha256: checksum,
  });

  return {
    fileName: `${batch.batch_code}.zip`,
    bytes: Buffer.from(zipped),
    manifestSha256: checksum,
  };
}

export { TICKET_DOCUMENT_BUCKET };
