import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireSupervisor } from "@/features/auth/guards";
import {
  internalError,
  invalidRequestError,
} from "@/features/attendance/errors";
import { attendanceOutcomeResponse } from "@/features/attendance/response";
import {
  getAttendanceServiceDeps,
  loadDetail,
} from "@/features/attendance/service";

export const dynamic = "force-dynamic";

/**
 * Registration attendance detail. Authorizes supervisor-level staff
 * server-side. The registration is addressed only by a short-lived signed
 * reference, verified against the server-resolved active event; no UUID is
 * accepted or returned. The response is private, never cached and carries
 * only safe display fields and the append-only attendance history.
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
    const outcome = await loadDetail(
      getAttendanceServiceDeps(),
      guard.session,
      body
    );
    return attendanceOutcomeResponse(outcome);
  } catch {
    return attendanceOutcomeResponse(internalError());
  }
}
