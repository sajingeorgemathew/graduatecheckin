import "server-only";

/**
 * Read services for the ticket-document administration pages.
 *
 * Every function verifies the acting session itself rather than relying on
 * a layout or proxy. Returned views never include a recipient email
 * address, a storage path, a raw token, a token hash or a checksum in full;
 * a row reports only whether an email exists, and checksums are shortened
 * for display.
 */

import type { StaffSession } from "@/features/auth/types";
import {
  ACTIVE_EVENT_FAILURE_MESSAGES,
  type ActiveEventFailureCode,
} from "@/features/events/active-event";
import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import { hasTicketAccess } from "@/features/tickets/permissions";
import { ticketAccessFailure, ticketFailure } from "@/features/tickets/errors";
import type { TicketServiceResult } from "@/features/tickets/types";
import type { GraduationTicketDocumentBatchRow } from "@/types/database";

import { shortChecksum } from "./fingerprint";
import { buildRegisteredParty } from "./party";
import {
  buildEventDetails,
  buildTicketSettings,
  fallbackTicketSettings,
} from "./presentation";
import { buildSourceFingerprint } from "./fingerprint";
import * as repo from "./repository";
import { buildTicketDocumentContext, evaluateStaleness } from "./service";
import {
  buildDocumentRows,
  filterDocumentRows,
  summarizeDocumentRows,
} from "./summaries";
import type {
  TicketDocumentListFilter,
  TicketDocumentListRow,
  TicketDocumentSummaryCounts,
  TicketDocumentView,
} from "./types";

function eventFailure<T>(code: ActiveEventFailureCode): TicketServiceResult<T> {
  return ticketFailure(409, code, ACTIVE_EVENT_FAILURE_MESSAGES[code]);
}

export interface TicketDocumentBatchView {
  batchId: string;
  batchCode: string;
  status: string;
  purpose: string;
  selectedCount: number;
  readyCount: number;
  excludedCount: number;
  createdAt: string;
  exportedAt: string | null;
}

export interface TicketDocumentAdminData {
  eventName: string;
  summary: TicketDocumentSummaryCounts;
  rows: TicketDocumentListRow[];
  filter: TicketDocumentListFilter;
  batches: TicketDocumentBatchView[];
}

function batchView(
  row: GraduationTicketDocumentBatchRow
): TicketDocumentBatchView {
  return {
    batchId: row.id,
    batchCode: row.batch_code,
    status: row.status,
    purpose: row.purpose,
    selectedCount: row.selected_count,
    readyCount: row.ready_count,
    excludedCount: row.excluded_count,
    createdAt: row.created_at,
    exportedAt: row.exported_at,
  };
}

/**
 * Loads the documents administration page.
 *
 * Live fingerprints are computed for every active ticket so stale
 * documents are detected on read. Nothing is generated here: opening the
 * page never renders, uploads or exports anything.
 */
export async function loadTicketDocumentAdminData(
  actor: StaffSession | null,
  filter: TicketDocumentListFilter
): Promise<TicketServiceResult<TicketDocumentAdminData>> {
  if (!hasTicketAccess(actor)) {
    return ticketAccessFailure();
  }

  const resolution = await resolveActiveEvent();
  if (!resolution.ok) {
    return eventFailure(resolution.code);
  }
  const event = resolution.event;

  const [registrations, activeTickets, documents, inBatches, settingsRow] =
    await Promise.all([
      repo.listEventRegistrations(event.id),
      repo.listActiveTicketsByRegistration(event.id),
      repo.listEventDocuments(event.id),
      repo.listRegistrationsInBatches(event.id),
      repo.getEventTicketSettings(event.id),
    ]);

  const settings =
    settingsRow === null
      ? fallbackTicketSettings(event)
      : buildTicketSettings(settingsRow);
  const eventDetails = buildEventDetails(event);

  // Guest rows are needed for the fingerprint of every active ticket.
  const registrationIds = registrations.map((row) => row.id);
  const guestsByRegistration = await repo.listGuestsForRegistrations(
    registrationIds
  );

  const registrationById = new Map(registrations.map((row) => [row.id, row]));
  const liveFingerprints = new Map<string, string>();
  for (const [registrationId, ticket] of activeTickets) {
    const registration = registrationById.get(registrationId);
    if (registration === undefined) {
      continue;
    }
    const party = buildRegisteredParty(
      {
        graduateFullName: registration.graduate_full_name,
        registeredAdultGuests: registration.registered_adult_guests,
        registeredChildren04: registration.registered_children_0_4,
        registeredChildren510: registration.registered_children_5_10,
      },
      guestsByRegistration.get(registrationId) ?? []
    );
    liveFingerprints.set(
      ticket.id,
      buildSourceFingerprint({
        ticketId: ticket.id,
        ticketStatus: ticket.status,
        ticketCode: ticket.ticket_code,
        party,
        event: eventDetails,
        settings: {
          displayTitle: settings.displayTitle,
          description: settings.description,
          programSchedule: settings.programSchedule,
          primaryLogoAsset: settings.primaryLogoAsset,
          secondaryAsset: settings.secondaryAsset,
          instructions: settings.instructions,
        },
        templateVersion: settings.templateVersion,
      })
    );
  }

  const rows = buildDocumentRows({
    registrations,
    activeTickets,
    documents,
    liveFingerprints,
    registrationsInBatches: inBatches,
  });

  const batches = await repo.listBatches(event.id);

  return {
    ok: true,
    data: {
      eventName: event.event_name,
      summary: summarizeDocumentRows(rows),
      rows: filterDocumentRows(rows, filter),
      filter,
      batches: batches.map(batchView),
    },
  };
}

export interface TicketDocumentSectionData {
  ticketId: string;
  current: TicketDocumentView | null;
  history: TicketDocumentView[];
  staleMessage: string | null;
}

/**
 * Loads the PDF Documents section shown on the existing ticket detail
 * page. This adds to that page; it never replaces or disturbs the current
 * web ticket preview.
 */
export async function loadTicketDocumentSection(
  actor: StaffSession | null,
  ticketId: string
): Promise<TicketServiceResult<TicketDocumentSectionData>> {
  if (!hasTicketAccess(actor)) {
    return ticketAccessFailure();
  }

  const history = await repo.listDocumentHistory(ticketId);
  const current = history.find((row) => row.status === "current") ?? null;

  let staleMessage: string | null = null;
  if (current !== null) {
    const context = await buildTicketDocumentContext(ticketId);
    if (context !== null) {
      staleMessage = evaluateStaleness(
        context,
        current.source_fingerprint,
        current.template_version,
        current.registered_party_snapshot
      ).message;
    }
  }

  const generatedByIds = history
    .map((row) => row.generated_by)
    .filter((value): value is string => value !== null);
  const names = await repo.getStaffDisplayNames(generatedByIds);

  const toView = (
    row: (typeof history)[number],
    isOutdated: boolean
  ): TicketDocumentView => ({
    documentId: row.id,
    ticketId: row.ticket_id,
    registrationId: row.registration_id,
    documentVersion: row.document_version,
    templateVersion: row.template_version,
    status: row.status,
    fileName: row.file_name,
    fileSizeBytes: row.file_size_bytes,
    checksumShort: shortChecksum(row.sha256_checksum),
    generatedAt: row.generated_at,
    generatedByDisplayName:
      row.generated_by === null ? null : names.get(row.generated_by) ?? null,
    supersededAt: row.superseded_at,
    invalidatedAt: row.invalidated_at,
    invalidationReason: row.invalidation_reason,
    isOutdated,
  });

  return {
    ok: true,
    data: {
      ticketId,
      current: current === null ? null : toView(current, staleMessage !== null),
      history: history.map((row) => toView(row, false)),
      staleMessage,
    },
  };
}
