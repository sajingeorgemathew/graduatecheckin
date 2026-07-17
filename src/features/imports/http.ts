import "server-only";

/**
 * Small helpers that keep the import route handlers thin. All import
 * responses are private and use no-store caching. Errors are structured
 * and never include stack traces or secret values.
 */

import { NextResponse } from "next/server";
import type { ServiceResult } from "./service";
import type { StructuredError } from "./types";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export function jsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function disabledResponse(): NextResponse {
  const body: StructuredError = {
    error: {
      code: "imports_disabled",
      message: "The import feature is not available.",
    },
  };
  return jsonResponse(body, 404);
}

export function internalErrorResponse(): NextResponse {
  const body: StructuredError = {
    error: {
      code: "internal_error",
      message: "The import operation failed. No changes were confirmed.",
    },
  };
  return jsonResponse(body, 500);
}

export function invalidRequestResponse(message: string): NextResponse {
  const body: StructuredError = {
    error: { code: "invalid_request", message },
  };
  return jsonResponse(body, 400);
}

export function serviceResponse<T>(result: ServiceResult<T>): NextResponse {
  if (result.ok) {
    return jsonResponse(result.data, 200);
  }
  return jsonResponse(result.error, result.status);
}
