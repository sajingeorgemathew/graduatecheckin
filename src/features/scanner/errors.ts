/**
 * Structured errors for the scanner service. Messages are safe for
 * browsers: no stack traces, no secrets, no raw tokens, no token hashes
 * and no reflection of submitted values.
 */

import type { ScannerStructuredError, ScanValidationOutcome } from "./types";

export function scannerError(
  status: number,
  code: string,
  message: string
): ScanValidationOutcome {
  const error: ScannerStructuredError = { error: { code, message } };
  return { kind: "error", status, error };
}

export function scannerInvalidRequestError(): ScanValidationOutcome {
  return scannerError(
    422,
    "invalid_request",
    "The validation request was invalid. Scan the ticket again."
  );
}

export function scannerConfigError(): ScanValidationOutcome {
  return scannerError(
    503,
    "scanner_configuration_invalid",
    "The scanner is not configured for an open event. Contact an " +
      "administrator."
  );
}

export function scannerInternalError(): ScanValidationOutcome {
  return scannerError(
    500,
    "validation_failed",
    "The ticket could not be validated. Try again."
  );
}
