import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireSupervisor } from "@/features/auth/guards";
import {
  internalError,
  invalidRequestError,
} from "@/features/attendance/errors";
import { applyAttendanceCorrection } from "@/features/attendance/correction";
import { attendanceOutcomeResponse } from "@/features/attendance/response";
import { getAttendanceServiceDeps } from "@/features/attendance/service";

export const dynamic = "force-dynamic";

/**
 * Applies an append-only attendance correction with positive or negative
 * deltas. Authorizes supervisor-level staff server-side; the acting user
 * comes from the trusted session and the active event is resolved
 * server-side. The registration is addressed only by a signed reference. The
 * request body is never logged and the response is private and never cached.
 * The atomic database function keeps every final total within allowances.
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
    const outcome = await applyAttendanceCorrection(
      getAttendanceServiceDeps(),
      guard.session,
      body
    );
    return attendanceOutcomeResponse(outcome);
  } catch {
    return attendanceOutcomeResponse(internalError());
  }
}
