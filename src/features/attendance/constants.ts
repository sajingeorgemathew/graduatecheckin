/**
 * Shared constants for the attendance feature. This module is safe to import
 * from both server and client code and must never contain secrets.
 */

export const ATTENDANCE_SUMMARY_API_PATH = "/api/staff/attendance/summary";
export const ATTENDANCE_SEARCH_API_PATH = "/api/staff/attendance/search";
export const ATTENDANCE_DETAIL_API_PATH = "/api/staff/attendance/detail";
export const ATTENDANCE_MANUAL_ARRIVAL_API_PATH =
  "/api/staff/attendance/manual-arrival";
export const ATTENDANCE_CORRECTION_API_PATH = "/api/staff/attendance/correction";
export const ATTENDANCE_REVERSE_API_PATH = "/api/staff/attendance/reverse";

export const ATTENDANCE_DASHBOARD_PATH = "/staff/attendance";

/** Dashboard polling cadence while the tab is visible, in milliseconds. */
export const DASHBOARD_POLL_INTERVAL_MS = 15_000;

/** The dashboard shows a stale-data warning after this long without a
 * successful refresh, in milliseconds. */
export const DASHBOARD_STALE_AFTER_MS = 60_000;

/** Most recent attendance entries shown in the activity feed. */
export const RECENT_ACTIVITY_LIMIT = 50;

/** Maximum registration search results returned. */
export const MAX_SEARCH_RESULTS = 25;

/** Minimum graduate-name search length. */
export const MIN_NAME_SEARCH_LENGTH = 2;

/** Minimum source-registration-id search length. */
export const MIN_SOURCE_ID_SEARCH_LENGTH = 2;

/** Live-search debounce for name and source-id typing, in milliseconds. A
 * complete ticket code searches immediately without waiting for this. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Candidate rows fetched from the database before the server applies the
 * attendance, ticket, registration and environment filters. The final result
 * set is always capped at MAX_SEARCH_RESULTS. Fetching a wider candidate set
 * keeps combined filters accurate without exposing more than 25 rows.
 */
export const SEARCH_CANDIDATE_CAP = 200;

/** Reason length bounds enforced in the schema and the database. */
export const MIN_REASON_LENGTH = 5;
export const MAX_REASON_LENGTH = 500;

/** Conservative upper bound for any single manual arriving-now count. */
export const MAX_ARRIVING_PER_CATEGORY = 20;

/** Exact confirmation phrases the higher-risk actions require. */
export const CORRECTION_CONFIRMATION_TEXT = "APPLY CORRECTION";
export const REVERSAL_CONFIRMATION_TEXT = "REVERSE ENTRY";
