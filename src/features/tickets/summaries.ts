/**
 * Pure computations over the active event's registrations and tickets:
 * summary counts, list filtering, search and pagination. Keeping these
 * free of database access makes the ticket-management behavior unit
 * testable with fictional data only.
 */

import { TICKETS_PAGE_SIZE } from "./constants";
import { isTicketActive } from "./eligibility";
import type {
  GenerationCandidate,
  RegistrationTicketSnapshot,
  RegistrationWithTickets,
  TicketListFilter,
  TicketListPage,
  TicketListRow,
  TicketSummaryCounts,
} from "./types";

/** A registration blocked from ticket generation by its own status. */
export function isBlockedRegistration(
  registration: RegistrationWithTickets
): boolean {
  return registration.registration_status !== "eligible";
}

export function hasActiveTicket(
  registration: RegistrationWithTickets
): boolean {
  return registration.tickets.some((ticket) => isTicketActive(ticket.status));
}

/**
 * The ticket shown for a registration in the list: the active ticket when
 * one exists, otherwise the most recently created ticket, otherwise none.
 */
export function displayTicketFor(
  registration: RegistrationWithTickets
): RegistrationTicketSnapshot | null {
  const active = registration.tickets.find((ticket) =>
    isTicketActive(ticket.status)
  );
  if (active !== undefined) {
    return active;
  }
  if (registration.tickets.length === 0) {
    return null;
  }
  return [...registration.tickets].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )[0];
}

export function computeTicketSummary(
  registrations: RegistrationWithTickets[]
): TicketSummaryCounts {
  let eligibleRegistrations = 0;
  let activeTickets = 0;
  let eligibleWithoutTickets = 0;
  let revokedTickets = 0;
  let replacedTickets = 0;
  let blockedRegistrations = 0;

  for (const registration of registrations) {
    const active = hasActiveTicket(registration);
    if (registration.registration_status === "eligible") {
      eligibleRegistrations += 1;
      if (!active) {
        eligibleWithoutTickets += 1;
      }
    } else {
      blockedRegistrations += 1;
    }
    for (const ticket of registration.tickets) {
      if (ticket.status === "active") {
        activeTickets += 1;
      } else if (ticket.status === "revoked") {
        revokedTickets += 1;
      } else if (ticket.status === "replaced") {
        replacedTickets += 1;
      }
    }
  }

  return {
    eligibleRegistrations,
    activeTickets,
    eligibleWithoutTickets,
    revokedTickets,
    replacedTickets,
    blockedRegistrations,
  };
}

export function matchesTicketFilter(
  registration: RegistrationWithTickets,
  filter: TicketListFilter
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return hasActiveTicket(registration);
    case "not_generated":
      return (
        registration.registration_status === "eligible" &&
        !hasActiveTicket(registration)
      );
    case "revoked":
      return registration.tickets.some((ticket) => ticket.status === "revoked");
    case "replaced":
      return registration.tickets.some(
        (ticket) => ticket.status === "replaced"
      );
    case "blocked":
      return isBlockedRegistration(registration);
    case "test":
      return registration.is_test;
    case "production":
      return !registration.is_test;
  }
}

/**
 * Case-insensitive search over graduate name, ticket code and source
 * registration ID. Email and phone are intentionally not searchable.
 */
export function matchesTicketSearch(
  registration: RegistrationWithTickets,
  search: string
): boolean {
  const term = search.trim().toLowerCase();
  if (term.length === 0) {
    return true;
  }
  if (registration.graduate_full_name.toLowerCase().includes(term)) {
    return true;
  }
  if (
    registration.source_registration_id !== null &&
    registration.source_registration_id.toLowerCase().includes(term)
  ) {
    return true;
  }
  return registration.tickets.some((ticket) =>
    ticket.ticket_code.toLowerCase().includes(term)
  );
}

function toListRow(registration: RegistrationWithTickets): TicketListRow {
  const ticket = displayTicketFor(registration);
  return {
    registrationId: registration.id,
    graduateName: registration.graduate_full_name,
    sourceRegistrationId: registration.source_registration_id,
    registrationStatus: registration.registration_status,
    partySize: registration.expected_party_size,
    isTest: registration.is_test,
    ticketId: ticket?.id ?? null,
    ticketCode: ticket?.ticket_code ?? null,
    ticketStatus: ticket?.status ?? null,
    issuedAt: ticket?.issued_at ?? null,
  };
}

export function buildTicketListPage(
  registrations: RegistrationWithTickets[],
  filter: TicketListFilter,
  search: string,
  page: number,
  pageSize: number = TICKETS_PAGE_SIZE
): TicketListPage {
  const filtered = registrations
    .filter((registration) => matchesTicketFilter(registration, filter))
    .filter((registration) => matchesTicketSearch(registration, search))
    .sort((a, b) => a.graduate_full_name.localeCompare(b.graduate_full_name));

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    rows: filtered.slice(start, start + pageSize).map(toListRow),
    page: safePage,
    pageSize,
    totalCount,
    totalPages,
  };
}

/** Eligible registrations without an active ticket, ready for selection. */
export function buildGenerationCandidates(
  registrations: RegistrationWithTickets[]
): GenerationCandidate[] {
  return registrations
    .filter((registration) => matchesTicketFilter(registration, "not_generated"))
    .sort((a, b) => a.graduate_full_name.localeCompare(b.graduate_full_name))
    .map((registration) => ({
      registrationId: registration.id,
      graduateName: registration.graduate_full_name,
      sourceRegistrationId: registration.source_registration_id,
      partySize: registration.expected_party_size,
      isTest: registration.is_test,
    }));
}

export function countByRegistrationStatus(
  registrations: RegistrationWithTickets[],
  status: RegistrationWithTickets["registration_status"]
): number {
  return registrations.filter(
    (registration) => registration.registration_status === status
  ).length;
}
