import "server-only";

/**
 * Structured HTTP responses for authentication and authorization failures.
 * Responses never include stack traces, secret values or hints about which
 * staff emails exist.
 */

import { NextResponse } from "next/server";
import type { GuardResult, StructuredAuthError } from "./types";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export function authErrorResponse(
  status: number,
  code: string,
  message: string
): NextResponse {
  const body: StructuredAuthError = { error: { code, message } };
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** Converts a failed guard into the matching 401 or 403 response. */
export function guardFailureResponse(
  guard: Extract<GuardResult, { ok: false }>
): NextResponse {
  return authErrorResponse(guard.status, guard.code, guard.message);
}
