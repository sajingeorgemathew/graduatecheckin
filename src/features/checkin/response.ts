import "server-only";

/**
 * Response helpers for check-in route handlers. All responses are private,
 * use no-store caching and never include stack traces, raw tokens, token
 * hashes, QR payloads, database error details or secret values.
 */

import { NextResponse } from "next/server";
import type { CheckinOutcome, CheckinResult } from "./types";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

/** Staff-readable message for every result. Every message is safe. */
export const CHECKIN_RESULT_MESSAGES: Record<CheckinResult, string> = {
  partial:
    "Partial arrival confirmed. Additional registered party members may " +
    "be checked in when they arrive.",
  complete:
    "Full party checked in. The graduate and full registered party have " +
    "now been recorded as arrived.",
  already_complete:
    "This registration has already been fully checked in. No further " +
    "arrival can be recorded.",
  validation_expired:
    "This validation has expired. Scan the current ticket again.",
  validation_used:
    "This validation has already been used. Scan the current ticket again.",
  ticket_not_active:
    "Ticket status changed. Scan the current ticket again.",
  registration_blocked:
    "This registration requires review before admission. Send the " +
    "graduate to the help desk.",
  wrong_event: "This ticket belongs to a different event.",
  invalid_counts:
    "Select at least one arriving person before confirming.",
  allowance_exceeded:
    "That would exceed the registered party allowance.",
  conflict:
    "The remaining allowance changed. The refreshed totals are shown; " +
    "scan the current ticket again to continue.",
  unauthorized: "Recording an arrival requires an active staff account.",
  configuration_error:
    "Check-in is not configured for an open event. Contact an " +
    "administrator.",
};

/** Maps a result to its HTTP status. */
export function checkinResultStatus(result: CheckinResult): number {
  switch (result) {
    case "partial":
    case "complete":
      return 200;
    case "unauthorized":
      return 403;
    case "validation_expired":
      return 410;
    case "already_complete":
    case "validation_used":
    case "ticket_not_active":
    case "conflict":
      return 409;
    case "registration_blocked":
    case "wrong_event":
    case "invalid_counts":
    case "allowance_exceeded":
      return 422;
    case "configuration_error":
      return 503;
  }
}

export function checkinJsonResponse(
  body: unknown,
  status: number
): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function checkinOutcomeResponse(outcome: CheckinOutcome): NextResponse {
  if (outcome.kind === "result") {
    return checkinJsonResponse(outcome.view, outcome.status);
  }
  return checkinJsonResponse(outcome.error, outcome.status);
}
