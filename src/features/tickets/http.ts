import "server-only";

/**
 * Response helpers for ticket route handlers. All responses are private,
 * use no-store caching and never include stack traces, raw tokens, token
 * hashes or secret values.
 */

import { NextResponse } from "next/server";
import type { TicketServiceResult, TicketStructuredError } from "./types";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export function ticketJsonResponse(
  body: unknown,
  status: number
): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function ticketInvalidRequestResponse(message: string): NextResponse {
  const body: TicketStructuredError = {
    error: { code: "invalid_request", message },
  };
  return ticketJsonResponse(body, 422);
}

export function ticketInternalErrorResponse(): NextResponse {
  const body: TicketStructuredError = {
    error: {
      code: "internal_error",
      message: "The ticket operation failed. No changes were confirmed.",
    },
  };
  return ticketJsonResponse(body, 500);
}

export function ticketServiceResponse<T>(
  result: TicketServiceResult<T>
): NextResponse {
  if (result.ok) {
    return ticketJsonResponse(result.data, 200);
  }
  return ticketJsonResponse(result.error, result.status);
}
