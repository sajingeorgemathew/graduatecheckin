import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireSupervisor } from "@/features/auth/guards";
import {
  internalError,
  invalidRequestError,
} from "@/features/attendance/errors";
import { recordManualArrival } from "@/features/attendance/manual-arrival";
import { attendanceOutcomeResponse } from "@/features/attendance/response";
import { getAttendanceServiceDeps } from "@/features/attendance/service";

export const dynamic = "force-dynamic";

/**
 * Records a manual arrival when a QR ticket is unavailable. Authorizes
 * supervisor-level staff server-side; the acting user comes from the trusted
 * session and the active event is resolved server-side. The registration is
 * addressed only by a signed reference. The request body is never logged and
 * the response is private and never cached. All locking, recalculation and
 * allowance enforcement happen inside the atomic database function.
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
    const outcome = await recordManualArrival(
      getAttendanceServiceDeps(),
      guard.session,
      body
    );
    return attendanceOutcomeResponse(outcome);
  } catch {
    return attendanceOutcomeResponse(internalError());
  }
}
