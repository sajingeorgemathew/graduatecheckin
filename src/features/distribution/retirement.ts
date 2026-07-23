/**
 * Retirement status of the Google Apps Script distribution workflow.
 *
 * CHECKIN-10B moved production sending to the Manual Delivery Desk, where
 * an administrator pastes each personalized email into Gmail themselves.
 * The Apps Script workflow from CHECKIN-09B and CHECKIN-09C is no longer
 * part of the required production path.
 *
 * Nothing is deleted. The .gs sources, the delivery tables, the migrations
 * and every historical delivery batch, attempt and result import remain
 * exactly as they were, and the pages remain reachable by direct link so
 * that audit history stays readable.
 *
 * What changes is only prominence: the flag below is false, so the
 * distribution entry points are absent from the administrator navigation
 * and the administration home, and every distribution page carries an
 * archived banner. Turning this flag back on restores the old entry points
 * without touching any other code.
 *
 * Runtime-neutral and free of secrets, so both server pages and client
 * components can read it.
 */

export const APPS_SCRIPT_DISTRIBUTION_ENABLED = false;

export const ARCHIVED_AUTOMATION_LABEL = "Archived automation";

export const ARCHIVED_AUTOMATION_NOTICE =
  "The Google Apps Script distribution workflow is archived and is not " +
  "part of the production release. It is kept for historical audit only: " +
  "no Google Sheet, no send queue and no results CSV is required to send " +
  "tickets. Use the Manual Delivery Desk instead.";

/** Where an administrator should go instead. */
export const ACTIVE_DELIVERY_PATH = "/admin/tickets/manual-delivery";
