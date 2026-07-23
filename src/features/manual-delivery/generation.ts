import "server-only";

/**
 * "Generate missing tickets".
 *
 * One administrator action closing the gap between an applied production
 * import and a desk full of sendable graduates:
 *
 *  1. issue a ticket for every eligible registration that has none,
 *  2. render a PDF for every active ticket whose current PDF is missing.
 *
 * Both halves only ever fill gaps. An existing valid ticket survives
 * untouched, and an existing current PDF is never regenerated - only an
 * explicit replacement creates a new ticket version. That is what makes
 * this safe to press repeatedly after a re-import.
 */

import { randomUUID } from "node:crypto";
import { canAccessAdmin } from "@/features/auth/permissions";
import type { StaffSession } from "@/features/auth/types";
import { ACTIVE_EVENT_FAILURE_MESSAGES } from "@/features/events/active-event";
import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import { generateTicketDocuments } from "@/features/ticket-documents/service";
import { GENERATE_CONFIRMATION_TEXT } from "@/features/tickets/constants";
import {
  getTicketGenerationDeps,
  runTicketGeneration,
} from "@/features/tickets/generation";
import { fetchEventRegistrationsWithTickets } from "@/features/tickets/repository";

import * as repo from "./repository";
import type { ServiceResult } from "./service";
import type { StructuredError } from "./types";

function failure(
  status: number,
  code: string,
  message: string
): { ok: false; status: number; error: StructuredError } {
  return { ok: false, status, error: { error: { code, message } } };
}

export interface GenerateMissingSummary {
  /** Registrations that were eligible but had no ticket. */
  ticketCandidates: number;
  ticketsGenerated: number;
  ticketsSkipped: number;
  /** Active tickets that had no current PDF. */
  pdfCandidates: number;
  pdfsGenerated: number;
  pdfsFailed: number;
}

/**
 * A registration is a ticket candidate when the reconciliation left it
 * eligible and it holds no active ticket. Failed, cancelled and
 * review_required registrations are never ticketed automatically.
 */
export async function generateMissingTickets(
  actor: StaffSession
): Promise<ServiceResult<GenerateMissingSummary>> {
  if (!canAccessAdmin(actor.role)) {
    return failure(
      403,
      "not_authorized",
      "Administrator access is required to generate tickets."
    );
  }

  const resolution = await resolveActiveEvent();
  if (!resolution.ok) {
    return failure(
      409,
      resolution.code,
      ACTIVE_EVENT_FAILURE_MESSAGES[resolution.code]
    );
  }
  const event = resolution.event;

  const registrations = await fetchEventRegistrationsWithTickets(event.id);
  const candidates = registrations
    .filter(
      (registration) =>
        registration.registration_status === "eligible" &&
        !registration.tickets.some((ticket) => ticket.status === "active")
    )
    .map((registration) => registration.id);

  let ticketsGenerated = 0;
  let ticketsSkipped = 0;

  if (candidates.length > 0) {
    const generation = await runTicketGeneration(
      getTicketGenerationDeps(),
      actor,
      {
        registrationIds: candidates,
        confirmationText: GENERATE_CONFIRMATION_TEXT,
        // A fresh key per press: the underlying batch function re-verifies
        // eligibility row by row, so a graduate who gained a ticket between
        // the two steps is skipped rather than double-ticketed.
        idempotencyKey: randomUUID(),
      }
    );
    if (!generation.ok) {
      return failure(
        generation.status,
        generation.error.error.code,
        generation.error.error.message
      );
    }
    ticketsGenerated = generation.data.generatedCount;
    ticketsSkipped = generation.data.skippedCount;
  }

  // Re-read after generation so tickets issued a moment ago receive a PDF
  // in the same press.
  const [activeTickets, currentDocuments] = await Promise.all([
    repo.listActiveTickets(event.id),
    repo.listCurrentDocuments(event.id),
  ]);

  const missingPdfTicketIds = [...activeTickets.values()]
    .filter((ticket) => !currentDocuments.has(ticket.id))
    .map((ticket) => ticket.id);

  const results = await generateTicketDocuments(
    actor.userId,
    missingPdfTicketIds
  );

  return {
    ok: true,
    data: {
      ticketCandidates: candidates.length,
      ticketsGenerated,
      ticketsSkipped,
      pdfCandidates: missingPdfTicketIds.length,
      pdfsGenerated: results.filter((result) => result.ok).length,
      pdfsFailed: results.filter((result) => !result.ok).length,
    },
  };
}
