/**
 * Shared constants for the check-in feature. This module is safe to import
 * from both server and client code. It must never contain secrets.
 */

export const CHECKIN_CONFIRM_API_PATH = "/api/staff/checkin/confirm";

/**
 * Conservative upper bound for any single guest or child arriving-now
 * count in the request schema. The database enforces the real registered
 * allowance; this only rejects absurd input early.
 */
export const MAX_ARRIVING_PER_CATEGORY = 20;

/** The graduate count is always zero or one. */
export const MAX_GRADUATE_ARRIVING = 1;
