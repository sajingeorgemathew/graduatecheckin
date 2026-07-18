import "server-only";

/**
 * Secure ticket replacement. A replacement generates a brand new ticket
 * UUID, ticket code and token hash server-side, so the previous QR token
 * can never validate again. The raw token for the new ticket exists for a
 * single statement while its hash is computed and is never stored,
 * logged or returned.
 */

import { randomUUID } from "node:crypto";
import type { StaffSession } from "@/features/auth/types";
import { getServerEnv } from "@/lib/env/server";
import type { Json } from "@/types/database";
import {
  databaseResultFailure,
  parseTicketDbResult,
  ticketAccessFailure,
  ticketConfigFailure,
  ticketFailure,
} from "./errors";
import { hasTicketAccess } from "./permissions";
import { replaceTicketRpc } from "./repository";
import { replaceTicketSchema, ticketIdSchema } from "./schemas";
import { generateTicketCode } from "./ticket-code";
import {
  buildTicketToken,
  hashTicketToken,
  TICKET_TOKEN_VERSION,
  validateTicketSecret,
} from "./token";
import type { ReplacementResult, TicketServiceResult } from "./types";

export interface TicketReplacementDeps {
  replaceTicket(
    actorUserId: string,
    ticketId: string,
    newTicketId: string,
    newTicketCode: string,
    newTokenHash: string,
    newTokenVersion: number,
    reason: string,
    requestId: string
  ): Promise<Json>;
  getTicketSecret(): string;
  newUuid(): string;
}

export function getTicketReplacementDeps(): TicketReplacementDeps {
  return {
    replaceTicket: replaceTicketRpc,
    getTicketSecret: () => getServerEnv().TICKET_TOKEN_SECRET,
    newUuid: randomUUID,
  };
}

export async function replaceTicket(
  deps: TicketReplacementDeps,
  actor: StaffSession,
  ticketId: string,
  input: unknown
): Promise<TicketServiceResult<ReplacementResult>> {
  if (!hasTicketAccess(actor)) {
    return ticketAccessFailure();
  }

  const parsedId = ticketIdSchema.safeParse(ticketId);
  if (!parsedId.success) {
    return ticketFailure(422, "invalid_ticket_id", "The ticket ID is invalid.");
  }

  const parsed = replaceTicketSchema.safeParse(input);
  if (!parsed.success) {
    return ticketFailure(
      422,
      "invalid_replacement_input",
      "Provide a reason between 5 and 500 characters and type the exact " +
        "confirmation text."
    );
  }

  if (!validateTicketSecret(deps.getTicketSecret()).valid) {
    return ticketConfigFailure();
  }

  const newTicketId = deps.newUuid();
  const newTicketCode = generateTicketCode();
  // The raw token exists only on this line; only its hash is kept.
  const newTokenHash = hashTicketToken(
    buildTicketToken(newTicketId, deps.getTicketSecret())
  );

  const dbResult = parseTicketDbResult(
    await deps.replaceTicket(
      actor.userId,
      parsedId.data,
      newTicketId,
      newTicketCode,
      newTokenHash,
      TICKET_TOKEN_VERSION,
      parsed.data.reason,
      deps.newUuid()
    )
  );
  if (!dbResult.ok) {
    return databaseResultFailure(dbResult.code);
  }

  return {
    ok: true,
    data: {
      previousTicketId: parsedId.data,
      newTicketId,
      newTicketCode,
    },
  };
}
