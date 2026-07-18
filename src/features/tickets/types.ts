/**
 * View and service types for the ticket feature. Views exposed to the UI
 * carry graduate names, ticket codes, statuses and party counts only.
 * Raw tokens, token hashes, emails, phone numbers and payment details are
 * never part of any browser-facing shape.
 */

import type {
  RegistrationStatus,
  TicketActivityAction,
  TicketStatus,
} from "@/types/database";

/** Minimal ticket fields loaded next to a registration. No token hash. */
export interface RegistrationTicketSnapshot {
  id: string;
  ticket_code: string;
  status: TicketStatus;
  issued_at: string | null;
  created_at: string;
}

/**
 * One registration of the active event with its tickets. This shape stays
 * server-side; list rows derived from it never include contact details.
 */
export interface RegistrationWithTickets {
  id: string;
  event_id: string;
  graduate_full_name: string;
  source_registration_id: string | null;
  registration_status: RegistrationStatus;
  expected_party_size: number;
  registered_adult_guests: number;
  registered_children_0_4: number;
  registered_children_5_10: number;
  is_test: boolean;
  tickets: RegistrationTicketSnapshot[];
}

export interface TicketSummaryCounts {
  eligibleRegistrations: number;
  activeTickets: number;
  eligibleWithoutTickets: number;
  revokedTickets: number;
  replacedTickets: number;
  blockedRegistrations: number;
}

export type TicketListFilter =
  | "all"
  | "active"
  | "not_generated"
  | "revoked"
  | "replaced"
  | "blocked"
  | "test"
  | "production";

/** One row of the ticket-management table. Registration centric. */
export interface TicketListRow {
  registrationId: string;
  graduateName: string;
  sourceRegistrationId: string | null;
  registrationStatus: RegistrationStatus;
  partySize: number;
  isTest: boolean;
  ticketId: string | null;
  ticketCode: string | null;
  ticketStatus: TicketStatus | null;
  issuedAt: string | null;
}

export interface TicketListPage {
  rows: TicketListRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/** One selectable candidate on the bulk-generation preview page. */
export interface GenerationCandidate {
  registrationId: string;
  graduateName: string;
  sourceRegistrationId: string | null;
  partySize: number;
  isTest: boolean;
}

export interface GenerationPreview {
  eventName: string;
  eventCode: string;
  eventIsTest: boolean;
  candidates: GenerationCandidate[];
  alreadyTicketedCount: number;
  failedCount: number;
  cancelledCount: number;
  reviewRequiredCount: number;
}

export interface GenerationResult {
  batchId: string;
  duplicate: boolean;
  candidateCount: number;
  generatedCount: number;
  skippedCount: number;
  errorCount: number;
}

export interface TicketActivityEntry {
  id: string;
  action: TicketActivityAction;
  actorDisplayName: string | null;
  previousTicketId: string | null;
  replacementTicketId: string | null;
  reason: string | null;
  createdAt: string;
}

/** Full detail view for one ticket. Never includes contact details. */
export interface TicketDetailView {
  ticketId: string;
  ticketCode: string;
  status: TicketStatus;
  issuedAt: string | null;
  issuedByDisplayName: string | null;
  revokedAt: string | null;
  revokedByDisplayName: string | null;
  revocationReason: string | null;
  replacedByTicketId: string | null;
  isTest: boolean;
  graduateName: string;
  registrationStatus: RegistrationStatus;
  registeredAdultGuests: number;
  registeredChildren04: number;
  registeredChildren510: number;
  partySize: number;
  eventName: string;
  startsAt: string | null;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
  activity: TicketActivityEntry[];
}

export interface ReplacementResult {
  previousTicketId: string;
  newTicketId: string;
  newTicketCode: string;
}

export interface RevocationResult {
  ticketId: string;
  status: "revoked";
}

export interface TicketStructuredError {
  error: {
    code: string;
    message: string;
  };
}

export type TicketServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: TicketStructuredError };
