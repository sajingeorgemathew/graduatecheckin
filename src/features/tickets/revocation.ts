import "server-only";

/**
 * Secure ticket revocation. Revoking marks the ticket revoked in the
 * atomic database function and never generates a replacement. A revoked
 * ticket can never return to active status; a new ticket must go through
 * the replacement process on an active ticket or bulk generation.
 */

import { randomUUID } from "node:crypto";
import type { StaffSession } from "@/features/auth/types";
import type { Json } from "@/types/database";
import {
  databaseResultFailure,
  parseTicketDbResult,
  ticketAccessFailure,
  ticketFailure,
} from "./errors";
import { hasTicketAccess } from "./permissions";
import { revokeTicketRpc } from "./repository";
import { revokeTicketSchema, ticketIdSchema } from "./schemas";
import type { RevocationResult, TicketServiceResult } from "./types";

export interface TicketRevocationDeps {
  revokeTicket(
    actorUserId: string,
    ticketId: string,
    reason: string,
    requestId: string
  ): Promise<Json>;
  newUuid(): string;
}

export function getTicketRevocationDeps(): TicketRevocationDeps {
  return {
    revokeTicket: revokeTicketRpc,
    newUuid: randomUUID,
  };
}

export async function revokeTicket(
  deps: TicketRevocationDeps,
  actor: StaffSession,
  ticketId: string,
  input: unknown
): Promise<TicketServiceResult<RevocationResult>> {
  if (!hasTicketAccess(actor)) {
    return ticketAccessFailure();
  }

  const parsedId = ticketIdSchema.safeParse(ticketId);
  if (!parsedId.success) {
    return ticketFailure(422, "invalid_ticket_id", "The ticket ID is invalid.");
  }

  const parsed = revokeTicketSchema.safeParse(input);
  if (!parsed.success) {
    return ticketFailure(
      422,
      "invalid_revocation_input",
      "Provide a reason between 5 and 500 characters and type the exact " +
        "confirmation text."
    );
  }

  const dbResult = parseTicketDbResult(
    await deps.revokeTicket(
      actor.userId,
      parsedId.data,
      parsed.data.reason,
      deps.newUuid()
    )
  );
  if (!dbResult.ok) {
    return databaseResultFailure(dbResult.code);
  }

  return { ok: true, data: { ticketId: parsedId.data, status: "revoked" } };
}
