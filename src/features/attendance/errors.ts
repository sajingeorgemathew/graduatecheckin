/**
 * Structured errors and database-result mapping for the attendance service.
 * Every message is safe for staff: no stack traces, no secrets, no raw
 * tokens, no token hashes, no database error details and no reflection of
 * submitted personal values.
 */

import type { AttendanceOutcome, AttendanceStructuredError } from "./types";

export function attendanceError<TView>(
  status: number,
  code: string,
  message: string
): AttendanceOutcome<TView> {
  const error: AttendanceStructuredError = { error: { code, message } };
  return { kind: "error", status, error };
}

export function unauthenticatedError<TView>(): AttendanceOutcome<TView> {
  return attendanceError(401, "not_authenticated", "Authentication is required.");
}

export function unauthorizedError<TView>(): AttendanceOutcome<TView> {
  return attendanceError(
    403,
    "unauthorized",
    "Attendance management requires an active supervisor or administrator."
  );
}

export function invalidRequestError<TView>(): AttendanceOutcome<TView> {
  return attendanceError(
    400,
    "invalid_request",
    "The request was invalid. Refresh and try again."
  );
}

export function invalidReferenceError<TView>(): AttendanceOutcome<TView> {
  return attendanceError(
    400,
    "invalid_reference",
    "That registration reference is not valid. Search again."
  );
}

export function expiredReferenceError<TView>(): AttendanceOutcome<TView> {
  return attendanceError(
    410,
    "expired_reference",
    "That reference has expired. Search again to continue."
  );
}

export function configurationError<TView>(): AttendanceOutcome<TView> {
  return attendanceError(
    503,
    "configuration_error",
    "Attendance is not configured for an open event. Contact an administrator."
  );
}

export function internalError<TView>(): AttendanceOutcome<TView> {
  return attendanceError(
    500,
    "attendance_failed",
    "The action could not be completed. Refresh and try again."
  );
}

/**
 * Maps a database result code to a safe HTTP status and staff-readable
 * message. Unknown codes fall through to a generic 500 so PostgreSQL detail
 * never leaks.
 */
interface CodeMapping {
  status: number;
  message: string;
}

const DB_CODE_MAP: Record<string, CodeMapping> = {
  unauthorized: {
    status: 403,
    message:
      "Attendance management requires an active supervisor or administrator.",
  },
  invalid_request: {
    status: 400,
    message: "The request was invalid. Refresh and try again.",
  },
  reason_required: {
    status: 422,
    message: "Enter a reason between 5 and 500 characters.",
  },
  invalid_counts: {
    status: 422,
    message: "Select at least one arriving person within the remaining party.",
  },
  invalid_correction: {
    status: 422,
    message: "Enter at least one non-zero correction within the allowed range.",
  },
  allowance_exceeded: {
    status: 422,
    message: "That would exceed the registered party allowance.",
  },
  result_out_of_range: {
    status: 422,
    message:
      "That correction would move a total outside zero and the registered " +
      "allowance. Adjust the values.",
  },
  unsafe_reversal: {
    status: 422,
    message:
      "This entry cannot be reversed without creating negative attendance. " +
      "Apply an attendance correction instead.",
  },
  not_reversible: {
    status: 422,
    message: "This entry cannot be reversed.",
  },
  already_reversed: {
    status: 409,
    message: "This entry has already been reversed.",
  },
  entry_not_found: {
    status: 404,
    message: "That attendance entry could not be found. Refresh and try again.",
  },
  conflict: {
    status: 409,
    message:
      "The attendance totals changed. The refreshed totals are shown; review " +
      "and try again.",
  },
  registration_blocked: {
    status: 422,
    message:
      "This registration is not eligible for admission. Send the graduate to " +
      "the help desk.",
  },
  configuration_error: {
    status: 503,
    message:
      "Attendance is not configured for an open event. Contact an " +
      "administrator.",
  },
};

export function mapDatabaseCode(code: string): CodeMapping {
  return (
    DB_CODE_MAP[code] ?? {
      status: 500,
      message: "The action could not be completed. Refresh and try again.",
    }
  );
}
