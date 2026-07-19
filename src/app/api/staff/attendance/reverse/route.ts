import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireSupervisor } from "@/features/auth/guards";
import {
  internalError,
  invalidRequestError,
} from "@/features/attendance/errors";
import { attendanceOutcomeResponse } from "@/features/attendance/response";
import { reverseAttendanceEntry } from "@/features/attendance/reversal";
import { getAttendanceServiceDeps } from "@/features/attendance/service";

export const dynamic = "force-dynamic";

/**
 * Reverses an eligible attendance entry by inserting its exact negative.
 * Authorizes supervisor-level staff server-side; the acting user comes from
 * the trusted session and the active event is resolved server-side. The
 * entry is addressed only by a signed reference. The request body is never
 * logged and the response is private and never cached. The atomic database
 * function blocks reversing a reversal, double reversal and any reversal that
 * would create negative attendance.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireSupervisor();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return attendanceOutcomeResponse(invalidRequestError());
  }

  try {
    const outcome = await reverseAttendanceEntry(
      getAttendanceServiceDeps(),
      guard.session,
      body
    );
    return attendanceOutcomeResponse(outcome);
  } catch {
    return attendanceOutcomeResponse(internalError());
  }
}
