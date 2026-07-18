/**
 * Failure helpers and structured errors for ticket services. Messages are
 * safe for browsers: no stack traces, no secrets, no raw tokens and no
 * token hashes ever appear here.
 */

import type { Json } from "@/types/database";
import type { TicketServiceResult, TicketStructuredError } from "./types";

export type TicketDbResult =
  | { ok: true; value: { [key: string]: Json | undefined } }
  | { ok: false; code: string };

/** Parses the JSON object returned by a ticket database function. */
export function parseTicketDbResult(json: Json): TicketDbResult {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, code: "unexpected_result" };
  }
  if (json.ok === true) {
    return { ok: true, value: json };
  }
  const code = typeof json.code === "string" ? json.code : "unexpected_result";
  return { ok: false, code };
}

export function ticketFailure<T>(
  status: number,
  code: string,
  message: string
): TicketServiceResult<T> {
  const error: TicketStructuredError = { error: { code, message } };
  return { ok: false, status, error };
}

export function ticketAccessFailure<T>(): TicketServiceResult<T> {
  return ticketFailure(
    403,
    "not_authorized",
    "Ticket management requires an active administrator."
  );
}

/** Raised when TICKET_TOKEN_SECRET is missing or too weak. */
export function ticketConfigFailure<T>(): TicketServiceResult<T> {
  return ticketFailure(
    503,
    "ticket_configuration_invalid",
    "The ticket signing configuration is missing or invalid. " +
      "Configure TICKET_TOKEN_SECRET before running ticket operations."
  );
}

/** Maps failure codes returned by the ticket database functions. */
export function databaseResultFailure<T>(code: string): TicketServiceResult<T> {
  switch (code) {
    case "not_authorized":
      return ticketAccessFailure();
    case "event_not_found":
      return ticketFailure(409, code, "The configured event was not found.");
    case "event_not_open":
      return ticketFailure(
        409,
        code,
        "The configured event is closed or archived."
      );
    case "ticket_not_found":
      return ticketFailure(404, code, "The ticket was not found.");
    case "ticket_not_active":
      return ticketFailure(
        409,
        code,
        "Only active tickets can be replaced or revoked."
      );
    case "registration_not_found":
      return ticketFailure(404, code, "The registration was not found.");
    case "registration_not_eligible":
      return ticketFailure(
        409,
        code,
        "The registration is no longer eligible for a ticket."
      );
    case "invalid_reason":
      return ticketFailure(
        422,
        code,
        "Provide a reason between 5 and 500 characters."
      );
    case "invalid_replacement":
      return ticketFailure(
        422,
        code,
        "The replacement request was invalid. Try the replacement again."
      );
    case "replacement_conflict":
      return ticketFailure(
        409,
        code,
        "The ticket changed while the replacement was processed. Reload " +
          "the ticket and try again."
      );
    case "idempotency_key_required":
      return ticketFailure(422, code, "The generation request was incomplete.");
    case "batch_in_progress":
      return ticketFailure(
        409,
        code,
        "This generation request is already being processed."
      );
    default:
      return ticketFailure(500, "ticket_operation_failed", "The ticket operation failed.");
  }
}
