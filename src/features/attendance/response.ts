import "server-only";

/**
 * Response helpers for attendance route handlers. All responses are private,
 * use no-store caching and never include stack traces, raw tokens, token
 * hashes, QR payloads, database error details, database UUIDs or secret
 * values.
 */

import { NextResponse } from "next/server";
import type { AttendanceOutcome } from "./types";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export function attendanceJsonResponse(
  body: unknown,
  status: number
): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function attendanceOutcomeResponse<TView>(
  outcome: AttendanceOutcome<TView>
): NextResponse {
  if (outcome.kind === "result") {
    return attendanceJsonResponse(outcome.view, outcome.status);
  }
  return attendanceJsonResponse(outcome.error, outcome.status);
}
