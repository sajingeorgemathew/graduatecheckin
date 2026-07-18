import "server-only";

/**
 * Response helpers for scanner route handlers. All responses are private,
 * use no-store caching and never include stack traces, raw tokens, token
 * hashes, QR payloads or secret values.
 */

import { NextResponse } from "next/server";
import type { ScannerStructuredError, ScanValidationOutcome } from "./types";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export function scannerJsonResponse(
  body: unknown,
  status: number
): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function scannerInvalidRequestResponse(): NextResponse {
  const body: ScannerStructuredError = {
    error: {
      code: "invalid_request",
      message: "The validation request was invalid. Scan the ticket again.",
    },
  };
  return scannerJsonResponse(body, 422);
}

export function scannerInternalErrorResponse(): NextResponse {
  const body: ScannerStructuredError = {
    error: {
      code: "validation_failed",
      message: "The ticket could not be validated. Try again.",
    },
  };
  return scannerJsonResponse(body, 500);
}

export function scannerOutcomeResponse(
  outcome: ScanValidationOutcome
): NextResponse {
  if (outcome.kind === "result") {
    return scannerJsonResponse(outcome.view, outcome.status);
  }
  return scannerJsonResponse(outcome.error, outcome.status);
}
