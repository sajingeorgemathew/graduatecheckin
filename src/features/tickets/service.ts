import "server-only";

/**
 * Read services for the ticket-management pages. Every function verifies
 * the acting session itself, so no page relies on the Proxy or layout
 * alone. Returned views never include emails, phone numbers, payment
 * details, raw tokens or token hashes.
 */

import type { StaffSession } from "@/features/auth/types";
import {
  ACTIVE_EVENT_FAILURE_MESSAGES,
  type ActiveEventFailureCode,
} from "@/features/events/active-event";
import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import type { TicketActivityLogRow } from "@/types/database";
import { ticketAccessFailure, ticketFailure } from "./errors";
import { hasTicketAccess } from "./permissions";
import {
  fetchEventRegistrationsWithTickets,
  getGenerationBatch,
  getStaffDisplayNames,
  getTicketContext,
  listTicketActivity,
} from "./repository";
import {
  ticketIdSchema,
  ticketListFilterSchema,
  ticketListPageSchema,
  ticketSearchSchema,
} from "./schemas";
import {
  buildGenerationCandidates,
  buildTicketListPage,
  computeTicketSummary,
  countByRegistrationStatus,
} from "./summaries";
import type {
  GenerationPreview,
  TicketActivityEntry,
  TicketDetailView,
  TicketListFilter,
  TicketListPage,
  TicketServiceResult,
  TicketSummaryCounts,
} from "./types";

function eventFailure<T>(code: ActiveEventFailureCode): TicketServiceResult<T> {
  return ticketFailure(409, code, ACTIVE_EVENT_FAILURE_MESSAGES[code]);
}

export interface TicketManagementData {
  eventName: string;
  eventIsTest: boolean;
  summary: TicketSummaryCounts;
  list: TicketListPage;
  filter: TicketListFilter;
  search: string;
}

/** Summary cards plus one filtered, searched, paginated list page. */
export async function getTicketManagementData(
  actor: StaffSession,
  rawFilter: unknown,
  rawSearch: unknown,
  rawPage: unknown
): Promise<TicketServiceResult<TicketManagementData>> {
  if (!hasTicketAccess(actor)) {
    return ticketAccessFailure();
  }

  const filterParsed = ticketListFilterSchema.safeParse(rawFilter ?? "all");
  const filter = filterParsed.success ? filterParsed.data : "all";
  const searchParsed = ticketSearchSchema.safeParse(rawSearch ?? "");
  const search = searchParsed.success ? searchParsed.data : "";
  const pageParsed = ticketListPageSchema.safeParse(rawPage ?? "1");
  const page = pageParsed.success ? pageParsed.data : 1;

  const eventResolution = await resolveActiveEvent();
  if (!eventResolution.ok) {
    return eventFailure(eventResolution.code);
  }

  const registrations = await fetchEventRegistrationsWithTickets(
    eventResolution.event.id
  );

  return {
    ok: true,
    data: {
      eventName: eventResolution.event.event_name,
      eventIsTest: eventResolution.event.is_test,
      summary: computeTicketSummary(registrations),
      list: buildTicketListPage(registrations, filter, search, page),
      filter,
      search,
    },
  };
}

/** Candidate data for the bulk-generation preview page. */
export async function getGenerationPreview(
  actor: StaffSession
): Promise<TicketServiceResult<GenerationPreview>> {
  if (!hasTicketAccess(actor)) {
    return ticketAccessFailure();
  }

  const eventResolution = await resolveActiveEvent();
  if (!eventResolution.ok) {
    return eventFailure(eventResolution.code);
  }
  const event = eventResolution.event;

  const registrations = await fetchEventRegistrationsWithTickets(event.id);
  const summary = computeTicketSummary(registrations);

  return {
    ok: true,
    data: {
      eventName: event.event_name,
      eventCode: event.event_code,
      eventIsTest: event.is_test,
      candidates: buildGenerationCandidates(registrations),
      alreadyTicketedCount:
        summary.eligibleRegistrations - summary.eligibleWithoutTickets,
      failedCount: countByRegistrationStatus(registrations, "failed"),
      cancelledCount: countByRegistrationStatus(registrations, "cancelled"),
      reviewRequiredCount: countByRegistrationStatus(
        registrations,
        "review_required"
      ),
    },
  };
}

function toActivityEntry(
  row: TicketActivityLogRow,
  displayNames: Map<string, string>
): TicketActivityEntry {
  return {
    id: row.id,
    action: row.action,
    actorDisplayName:
      row.actor_user_id !== null
        ? (displayNames.get(row.actor_user_id) ?? null)
        : null,
    previousTicketId: row.previous_ticket_id,
    replacementTicketId: row.replacement_ticket_id,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

/** Full detail for one ticket. Token hashes never leave the server. */
export async function getTicketDetail(
  actor: StaffSession,
  rawTicketId: string
): Promise<TicketServiceResult<TicketDetailView>> {
  if (!hasTicketAccess(actor)) {
    return ticketAccessFailure();
  }

  const parsedId = ticketIdSchema.safeParse(rawTicketId);
  if (!parsedId.success) {
    return ticketFailure(422, "invalid_ticket_id", "The ticket ID is invalid.");
  }

  const context = await getTicketContext(parsedId.data);
  if (context === null) {
    return ticketFailure(404, "ticket_not_found", "The ticket was not found.");
  }
  const { ticket, registration, event } = context;

  const activityRows = await listTicketActivity(ticket.id);
  const staffIds = [
    ...(ticket.issued_by !== null ? [ticket.issued_by] : []),
    ...(ticket.revoked_by !== null ? [ticket.revoked_by] : []),
    ...activityRows
      .map((row) => row.actor_user_id)
      .filter((value): value is string => value !== null),
  ];
  const displayNames = await getStaffDisplayNames(staffIds);

  return {
    ok: true,
    data: {
      ticketId: ticket.id,
      ticketCode: ticket.ticket_code,
      status: ticket.status,
      issuedAt: ticket.issued_at,
      issuedByDisplayName:
        ticket.issued_by !== null
          ? (displayNames.get(ticket.issued_by) ?? null)
          : null,
      revokedAt: ticket.revoked_at,
      revokedByDisplayName:
        ticket.revoked_by !== null
          ? (displayNames.get(ticket.revoked_by) ?? null)
          : null,
      revocationReason: ticket.revocation_reason,
      replacedByTicketId: ticket.replaced_by_ticket_id,
      isTest: ticket.is_test,
      graduateName: registration.graduate_full_name,
      registrationStatus: registration.registration_status,
      registeredAdultGuests: registration.registered_adult_guests,
      registeredChildren04: registration.registered_children_0_4,
      registeredChildren510: registration.registered_children_5_10,
      partySize: registration.expected_party_size,
      eventName: event.event_name,
      startsAt: event.starts_at,
      timezone: event.timezone,
      venueName: event.venue_name,
      venueAddress: event.venue_address,
      activity: activityRows.map((row) => toActivityEntry(row, displayNames)),
    },
  };
}

export interface BatchSummary {
  batchId: string;
  status: string;
  candidateCount: number;
  generatedCount: number;
  skippedCount: number;
  errorCount: number;
  completedAt: string | null;
}

/** Result summary shown after a bulk generation redirect. */
export async function getBatchSummary(
  actor: StaffSession,
  rawBatchId: string
): Promise<TicketServiceResult<BatchSummary>> {
  if (!hasTicketAccess(actor)) {
    return ticketAccessFailure();
  }
  const parsedId = ticketIdSchema.safeParse(rawBatchId);
  if (!parsedId.success) {
    return ticketFailure(422, "invalid_batch_id", "The batch ID is invalid.");
  }
  const batch = await getGenerationBatch(parsedId.data);
  if (batch === null) {
    return ticketFailure(404, "batch_not_found", "The batch was not found.");
  }
  return {
    ok: true,
    data: {
      batchId: batch.id,
      status: batch.status,
      candidateCount: batch.candidate_count,
      generatedCount: batch.generated_count,
      skippedCount: batch.skipped_count,
      errorCount: batch.error_count,
      completedAt: batch.completed_at,
    },
  };
}
