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
  searchRegistrations,
} from "@/features/attendance/service";

export const dynamic = "force-dynamic";

/**
 * Manual registration search, limited to the server-resolved active event.
 * Authorizes supervisor-level staff server-side. Searches by graduate name,
 * exact ticket code or source registration id only; email and phone search
 * are unsupported. Returns a short-lived signed registration reference per
 * result and never a database UUID. The request body is never logged and the
 * response is private and never cached.
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
    const outcome = await searchRegistrations(
      getAttendanceServiceDeps(),
      guard.session,
      body
    );
    return attendanceOutcomeResponse(outcome);
  } catch {
    return attendanceOutcomeResponse(internalError());
  }
}
