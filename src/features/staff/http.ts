import "server-only";

/**
 * Response helpers for staff administration route handlers. All responses
 * are private, use no-store caching and never include stack traces or
 * secret values.
 */

import { NextResponse } from "next/server";
import type { StaffServiceResult, StaffStructuredError } from "./types";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export function staffJsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function staffInvalidRequestResponse(message: string): NextResponse {
  const body: StaffStructuredError = {
    error: { code: "invalid_request", message },
  };
  return staffJsonResponse(body, 422);
}

export function staffInternalErrorResponse(): NextResponse {
  const body: StaffStructuredError = {
    error: {
      code: "internal_error",
      message: "The staff operation failed. No changes were confirmed.",
    },
  };
  return staffJsonResponse(body, 500);
}

export function staffServiceResponse<T>(
  result: StaffServiceResult<T>
): NextResponse {
  if (result.ok) {
    return staffJsonResponse(result.data, 200);
  }
  return staffJsonResponse(result.error, result.status);
}
