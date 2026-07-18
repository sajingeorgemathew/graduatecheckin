import "server-only";

/**
 * Bulk ticket generation. Ticket UUIDs, ticket codes and token hashes are
 * generated here, server-side only. The raw HMAC token for each ticket
 * exists for a single statement while its hash is computed and is never
 * stored, logged, returned or placed in the batch items.
 */

import { randomUUID } from "node:crypto";
import type { StaffSession } from "@/features/auth/types";
import {
  ACTIVE_EVENT_FAILURE_MESSAGES,
  type ActiveEventResolution,
} from "@/features/events/active-event";
import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import { getServerEnv } from "@/lib/env/server";
import type { Json } from "@/types/database";
import {
  databaseResultFailure,
  parseTicketDbResult,
  ticketConfigFailure,
  ticketFailure,
  ticketAccessFailure,
} from "./errors";
import { hasTicketAccess } from "./permissions";
import {
  applyTicketGenerationBatchRpc,
  fetchEventRegistrationsWithTickets,
  type BatchItemInput,
} from "./repository";
import { generateTicketsSchema } from "./schemas";
import { generateUniqueTicketCode } from "./ticket-code";
import {
  buildTicketToken,
  hashTicketToken,
  TICKET_TOKEN_VERSION,
  validateTicketSecret,
} from "./token";
import type { GenerationResult, TicketServiceResult } from "./types";

/** Dependency bundle so generation is testable without a database. */
export interface TicketGenerationDeps {
  resolveActiveEvent(): Promise<ActiveEventResolution>;
  fetchRegistrations(
    eventId: string
  ): ReturnType<typeof fetchEventRegistrationsWithTickets>;
  applyBatch(
    actorUserId: string,
    eventId: string,
    idempotencyKey: string,
    requestId: string,
    items: BatchItemInput[]
  ): Promise<Json>;
  getTicketSecret(): string;
  newUuid(): string;
}

export function getTicketGenerationDeps(): TicketGenerationDeps {
  return {
    resolveActiveEvent,
    fetchRegistrations: fetchEventRegistrationsWithTickets,
    applyBatch: applyTicketGenerationBatchRpc,
    getTicketSecret: () => getServerEnv().TICKET_TOKEN_SECRET,
    newUuid: randomUUID,
  };
}

function parseGenerationValue(value: {
  [key: string]: Json | undefined;
}): GenerationResult | null {
  if (typeof value.batch_id !== "string") {
    return null;
  }
  return {
    batchId: value.batch_id,
    duplicate: value.duplicate === true,
    candidateCount:
      typeof value.candidate_count === "number" ? value.candidate_count : 0,
    generatedCount:
      typeof value.generated_count === "number" ? value.generated_count : 0,
    skippedCount:
      typeof value.skipped_count === "number" ? value.skipped_count : 0,
    errorCount: typeof value.error_count === "number" ? value.error_count : 0,
  };
}

/**
 * Runs one idempotent bulk generation batch for the configured active
 * event. Eligibility is re-verified row by row inside the atomic database
 * function, so browser-side selection is never trusted.
 */
export async function runTicketGeneration(
  deps: TicketGenerationDeps,
  actor: StaffSession,
  input: unknown
): Promise<TicketServiceResult<GenerationResult>> {
  if (!hasTicketAccess(actor)) {
    return ticketAccessFailure();
  }

  const parsed = generateTicketsSchema.safeParse(input);
  if (!parsed.success) {
    return ticketFailure(
      422,
      "invalid_generation_input",
      "Select registrations and type the exact confirmation text."
    );
  }

  if (!validateTicketSecret(deps.getTicketSecret()).valid) {
    return ticketConfigFailure();
  }

  const eventResolution = await deps.resolveActiveEvent();
  if (!eventResolution.ok) {
    return ticketFailure(
      409,
      eventResolution.code,
      ACTIVE_EVENT_FAILURE_MESSAGES[eventResolution.code]
    );
  }
  const event = eventResolution.event;

  // Registrations that do not belong to the active event are dropped here;
  // the database function re-verifies event membership and eligibility.
  const registrations = await deps.fetchRegistrations(event.id);
  const eventRegistrationIds = new Set(
    registrations.map((registration) => registration.id)
  );
  const existingCodes = new Set(
    registrations.flatMap((registration) =>
      registration.tickets.map((ticket) => ticket.ticket_code)
    )
  );

  const requestedIds = [...new Set(parsed.data.registrationIds)].filter((id) =>
    eventRegistrationIds.has(id)
  );
  if (requestedIds.length === 0) {
    return ticketFailure(
      409,
      "no_valid_candidates",
      "None of the selected registrations belong to the active event."
    );
  }

  const secret = deps.getTicketSecret();
  const items: BatchItemInput[] = requestedIds.map((registrationId) => {
    const ticketId = deps.newUuid();
    const ticketCode = generateUniqueTicketCode(existingCodes);
    existingCodes.add(ticketCode);
    // The raw token exists only on this line; only its hash is kept.
    const tokenHash = hashTicketToken(buildTicketToken(ticketId, secret));
    return {
      ticket_id: ticketId,
      registration_id: registrationId,
      ticket_code: ticketCode,
      token_hash: tokenHash,
      token_version: TICKET_TOKEN_VERSION,
    };
  });

  const dbResult = parseTicketDbResult(
    await deps.applyBatch(
      actor.userId,
      event.id,
      parsed.data.idempotencyKey,
      deps.newUuid(),
      items
    )
  );
  if (!dbResult.ok) {
    return databaseResultFailure(dbResult.code);
  }

  const result = parseGenerationValue(dbResult.value);
  if (result === null) {
    return ticketFailure(
      500,
      "ticket_operation_failed",
      "The ticket generation result could not be read."
    );
  }
  return { ok: true, data: result };
}
