/**
 * Shared constants for the ticket feature. This module is safe to import
 * from both server and client code. It must never contain secrets.
 */

export const TICKETS_PAGE_SIZE = 25;

/** Exact confirmation text required before bulk generation runs. */
export const GENERATE_CONFIRMATION_TEXT = "GENERATE TICKETS";

/** Exact confirmation text required before a ticket is replaced. */
export const REPLACE_CONFIRMATION_TEXT = "REPLACE TICKET";

/** Exact confirmation text required before a ticket is revoked. */
export const REVOKE_CONFIRMATION_TEXT = "REVOKE TICKET";

export const REASON_MIN_LENGTH = 5;

export const REASON_MAX_LENGTH = 500;

export const TICKET_ENTRANCE_MESSAGE =
  "Present this ticket at the entrance. Event staff will scan the QR code " +
  "and confirm attendance for the graduate and registered party.";

export const TICKET_UNIQUE_MESSAGE =
  "This ticket is unique to this registration. Do not share or duplicate it.";
