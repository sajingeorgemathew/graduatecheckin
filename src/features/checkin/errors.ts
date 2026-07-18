/**
 * Structured errors for the check-in service. Messages are safe for
 * browsers: no stack traces, no secrets, no raw tokens, no token hashes,
 * no database error details and no reflection of submitted values.
 */

import type { CheckinOutcome, CheckinStructuredError } from "./types";

export function checkinError(
  status: number,
  code: string,
  message: string
): CheckinOutcome {
  const error: CheckinStructuredError = { error: { code, message } };
  return { kind: "error", status, error };
}

export function checkinUnauthenticatedError(): CheckinOutcome {
  return checkinError(401, "not_authenticated", "Authentication is required.");
}

export function checkinUnauthorizedError(): CheckinOutcome {
  return checkinError(
    403,
    "unauthorized",
    "Recording an arrival requires an active staff account."
  );
}

export function checkinInvalidRequestError(): CheckinOutcome {
  return checkinError(
    400,
    "invalid_request",
    "The confirmation request was invalid. Scan the ticket again."
  );
}

export function checkinConfigError(): CheckinOutcome {
  return checkinError(
    503,
    "configuration_error",
    "Check-in is not configured for an open event. Contact an administrator."
  );
}

export function checkinInternalError(): CheckinOutcome {
  return checkinError(
    500,
    "confirmation_failed",
    "The arrival could not be recorded. Scan the ticket again."
  );
}
