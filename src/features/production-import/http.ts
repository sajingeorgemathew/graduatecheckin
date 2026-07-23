import "server-only";

/**
 * Response helpers keeping the production-import route handlers thin. Every
 * response is private and uncached. Errors are structured and never carry a
 * stack trace, a secret or a spreadsheet value.
 */

import { NextResponse } from "next/server";
import type { ServiceResult } from "./service";
import type { StructuredError } from "./types";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export function jsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function invalidRequestResponse(message: string): NextResponse {
  const body: StructuredError = {
    error: { code: "invalid_request", message },
  };
  return jsonResponse(body, 400);
}

export function internalErrorResponse(): NextResponse {
  const body: StructuredError = {
    error: {
      code: "internal_error",
      message: "The operation failed. No changes were confirmed.",
    },
  };
  return jsonResponse(body, 500);
}

export function serviceResponse<T>(result: ServiceResult<T>): NextResponse {
  if (result.ok) {
    return jsonResponse(result.data, 200);
  }
  return jsonResponse(result.error, result.status);
}
