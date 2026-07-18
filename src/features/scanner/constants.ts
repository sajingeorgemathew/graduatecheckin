/**
 * Shared constants for the scanner feature. This module is safe to import
 * from both server and client code. It must never contain secrets.
 */

export const SCANNER_PAGE_PATH = "/staff/scanner";

export const SCANNER_VALIDATE_API_PATH = "/api/staff/scanner/validate";

/** Maximum accepted length of a decoded QR value. */
export const MAX_QR_VALUE_LENGTH = 512;

/** Maximum accepted length of a manually typed ticket code. */
export const MAX_MANUAL_CODE_LENGTH = 32;

/**
 * Server-side rate limit: validation requests allowed per staff user per
 * rolling window. Applied independently of any client-side debounce.
 */
export const SCAN_RATE_LIMIT_MAX_REQUESTS = 60;

export const SCAN_RATE_LIMIT_WINDOW_MS = 60_000;

/** Maximum tickets followed when resolving a replacement chain. */
export const REPLACEMENT_CHAIN_MAX_DEPTH = 10;

/** In-memory session history length on the scanner page. */
export const RECENT_VALIDATIONS_LIMIT = 5;

export const SCANNER_SUPPORT_TEXT =
  "Scan the graduate's QR ticket to verify the registration and " +
  "registered party.";

export const SCANNER_VALIDATION_ONLY_NOTICE =
  "This screen validates the ticket only. Attendance confirmation will be " +
  "added in the next stage.";
