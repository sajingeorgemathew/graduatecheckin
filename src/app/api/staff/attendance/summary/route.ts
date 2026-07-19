import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireSupervisor } from "@/features/auth/guards";
import { internalError } from "@/features/attendance/errors";
import { attendanceOutcomeResponse } from "@/features/attendance/response";
import {
  getAttendanceServiceDeps,
  loadSummary,
} from "@/features/attendance/service";

export const dynamic = "force-dynamic";

/**
 * Live attendance summary. Authorizes supervisor-level staff server-side on
 * every call; scanner, anonymous, inactive and password-change-required
 * callers are denied. The active event is resolved server-side and never
 * accepted from the browser. The response is private, never cached and
 * carries only aggregate counts, a graduate name and staff display names in
 * the recent activity feed; no email, phone, guest name, payment value,
 * token, hash or database UUID is ever returned.
 */
export async function GET(): Promise<NextResponse> {
  const guard = await requireSupervisor();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }
  try {
    const outcome = await loadSummary(getAttendanceServiceDeps(), guard.session);
    return attendanceOutcomeResponse(outcome);
  } catch {
    return attendanceOutcomeResponse(internalError());
  }
}
