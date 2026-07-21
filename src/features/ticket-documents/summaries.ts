/**
 * Derives the administration page's counts, rows and filters.
 *
 * Pure functions over already-loaded records, so the whole page state is
 * unit testable without a database. Nothing here carries a recipient email
 * to the browser: a row only reports whether an email exists.
 */

import type {
  GraduationTicketDocumentRow,
  TicketDocumentStatusEnum,
} from "@/types/database";

import type { ActiveTicketRecord, DocumentRegistrationRecord } from "./repository";
import type {
  TicketDocumentListFilter,
  TicketDocumentListRow,
  TicketDocumentRowState,
  TicketDocumentSummaryCounts,
} from "./types";

export interface BuildRowsInput {
  registrations: readonly DocumentRegistrationRecord[];
  activeTickets: ReadonlyMap<string, ActiveTicketRecord>;
  documents: readonly GraduationTicketDocumentRow[];
  /** Live fingerprints keyed by ticket id, for stale detection. */
  liveFingerprints: ReadonlyMap<string, string>;
  registrationsInBatches: ReadonlySet<string>;
}

function documentState(
  status: TicketDocumentStatusEnum,
  isOutdated: boolean
): TicketDocumentRowState {
  if (status === "invalidated") {
    return "invalidated";
  }
  if (status === "superseded") {
    return "superseded";
  }
  return isOutdated ? "outdated" : "current";
}

/**
 * Builds one row per registration that holds an active ticket. A
 * registration without an active ticket is not eligible for a PDF and is
 * excluded, matching the existing ticket-management eligibility rules.
 */
export function buildDocumentRows(
  input: BuildRowsInput
): TicketDocumentListRow[] {
  const currentByTicket = new Map<string, GraduationTicketDocumentRow>();
  const anyByTicket = new Map<string, GraduationTicketDocumentRow>();
  for (const document of input.documents) {
    if (document.status === "current") {
      currentByTicket.set(document.ticket_id, document);
    }
    const existing = anyByTicket.get(document.ticket_id);
    if (
      existing === undefined ||
      document.document_version > existing.document_version
    ) {
      anyByTicket.set(document.ticket_id, document);
    }
  }

  const rows: TicketDocumentListRow[] = [];
  for (const registration of input.registrations) {
    const ticket = input.activeTickets.get(registration.id);
    if (ticket === undefined) {
      continue;
    }
    const current = currentByTicket.get(ticket.id);
    const latest = anyByTicket.get(ticket.id);

    let state: TicketDocumentRowState;
    let documentVersion: number | null = null;
    let generatedAt: string | null = null;

    if (current !== undefined) {
      const live = input.liveFingerprints.get(ticket.id);
      const isOutdated =
        live !== undefined && live !== current.source_fingerprint;
      state = documentState("current", isOutdated);
      documentVersion = current.document_version;
      generatedAt = current.generated_at;
    } else if (latest !== undefined) {
      state = documentState(latest.status, false);
      documentVersion = latest.document_version;
      generatedAt = latest.generated_at;
    } else {
      state = "missing";
    }

    const hasRecipientEmail = (registration.email ?? "").trim().length > 0;

    rows.push({
      registrationId: registration.id,
      ticketId: ticket.id,
      ticketCode: ticket.ticket_code,
      graduateName: registration.graduate_full_name,
      partySize: registration.expected_party_size,
      isTest: registration.is_test,
      hasRecipientEmail,
      state,
      documentVersion,
      generatedAt,
      inExportBatch: input.registrationsInBatches.has(registration.id),
      // Only a genuinely current, non-stale document may be exported.
      readyForExport:
        state === "current" &&
        hasRecipientEmail &&
        !input.registrationsInBatches.has(registration.id),
    });
  }
  return rows;
}

export function summarizeDocumentRows(
  rows: readonly TicketDocumentListRow[]
): TicketDocumentSummaryCounts {
  const counts: TicketDocumentSummaryCounts = {
    eligibleActiveTickets: rows.length,
    missingPdf: 0,
    currentPdf: 0,
    outdatedPdf: 0,
    supersededPdf: 0,
    invalidatedPdf: 0,
    generationFailed: 0,
    readyForExport: 0,
    alreadyInExportBatch: 0,
    missingRecipientEmail: 0,
    testRegistrations: 0,
    productionRegistrations: 0,
  };
  for (const row of rows) {
    switch (row.state) {
      case "missing":
        counts.missingPdf += 1;
        break;
      case "current":
        counts.currentPdf += 1;
        break;
      case "outdated":
        counts.outdatedPdf += 1;
        break;
      case "superseded":
        counts.supersededPdf += 1;
        break;
      case "invalidated":
        counts.invalidatedPdf += 1;
        break;
      case "failed":
        counts.generationFailed += 1;
        break;
    }
    if (row.readyForExport) {
      counts.readyForExport += 1;
    }
    if (row.inExportBatch) {
      counts.alreadyInExportBatch += 1;
    }
    if (!row.hasRecipientEmail) {
      counts.missingRecipientEmail += 1;
    }
    if (row.isTest) {
      counts.testRegistrations += 1;
    } else {
      counts.productionRegistrations += 1;
    }
  }
  return counts;
}

export function filterDocumentRows(
  rows: readonly TicketDocumentListRow[],
  filter: TicketDocumentListFilter
): TicketDocumentListRow[] {
  switch (filter) {
    case "missing":
      return rows.filter((row) => row.state === "missing");
    case "current":
      return rows.filter((row) => row.state === "current");
    case "outdated":
      return rows.filter((row) => row.state === "outdated");
    case "invalidated":
      return rows.filter((row) => row.state === "invalidated");
    case "ready_for_export":
      return rows.filter((row) => row.readyForExport);
    case "missing_email":
      return rows.filter((row) => !row.hasRecipientEmail);
    case "test":
      return rows.filter((row) => row.isTest);
    case "production":
      return rows.filter((row) => !row.isTest);
    case "all":
    default:
      return [...rows];
  }
}
