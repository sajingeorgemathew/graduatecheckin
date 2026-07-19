/**
 * Runtime type guards for attendance API responses used by client
 * components. They confirm the shape of a parsed JSON payload before it is
 * treated as a typed view.
 */

import type {
  AttendanceDetailView,
  AttendanceSearchView,
  AttendanceSummaryView,
  AttendanceWriteView,
} from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAttendanceSummaryView(
  value: unknown
): value is AttendanceSummaryView {
  return (
    isRecord(value) &&
    typeof value.generatedAt === "string" &&
    typeof value.eligibleRegistrations === "number" &&
    Array.isArray(value.recentActivity)
  );
}

export function isAttendanceSearchView(
  value: unknown
): value is AttendanceSearchView {
  return isRecord(value) && Array.isArray(value.results);
}

export function isAttendanceDetailView(
  value: unknown
): value is AttendanceDetailView {
  return (
    isRecord(value) &&
    typeof value.registrationReference === "string" &&
    Array.isArray(value.history)
  );
}

export function isAttendanceWriteView(
  value: unknown
): value is AttendanceWriteView {
  return (
    isRecord(value) &&
    isRecord(value.registered) &&
    isRecord(value.arrived) &&
    isRecord(value.remaining) &&
    typeof value.classification === "string"
  );
}
