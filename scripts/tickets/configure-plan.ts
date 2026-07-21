/**
 * Pure planning logic for the Convocation Ceremony 2026 configuration.
 *
 * Runtime-neutral: no Next.js import, no "server-only" import, no database
 * or environment access. It owns the target values and the idempotent
 * change-diffing so both the CLI script and its tests share one source of
 * truth. Given a current event row and settings row it reports exactly what
 * would change, and reports nothing when the stored state already matches.
 */

import { TICKET_DOCUMENT_TEMPLATE_VERSION } from "../../src/features/ticket-documents/constants";
import type { ProgramScheduleEntry } from "../../src/features/ticket-documents/types";

export const EVENT_NAME = "Convocation Ceremony 2026";
export const EVENT_TIMEZONE = "America/Toronto";

/**
 * 12:00 PM and 4:00 PM on 2026-07-26 in America/Toronto. July is EDT
 * (UTC-4), so the stored UTC instants are 16:00 and 20:00.
 */
export const EVENT_STARTS_AT = "2026-07-26T16:00:00.000Z";
export const EVENT_ENDS_AT = "2026-07-26T20:00:00.000Z";

export const VENUE_NAME = "Mississauga Grand Banquet & Event Centre";
export const VENUE_ADDRESS = "35 Brunel Road, Mississauga, ON L4Z 3E8";

export const TICKET_DESCRIPTION =
  "Celebrate this important milestone with Toronto Academy of Education " +
  "at Convocation Ceremony 2026. This single admission ticket covers the " +
  "graduate and all registered guests shown on this ticket. No separate " +
  "guest ticket is required. Save the PDF on your phone or bring a " +
  "printed copy and present the QR code at check-in.";

export const PROGRAM_SCHEDULE: ProgramScheduleEntry[] = [
  {
    startTime: "12:15 PM",
    endTime: "1:00 PM",
    title: "Introduction & Refreshments",
  },
  {
    startTime: "1:00 PM",
    endTime: "1:30 PM",
    title: "A Special Message to Our Graduates",
  },
  {
    startTime: "1:30 PM",
    endTime: "2:30 PM",
    title: "Certificate & Award Ceremony",
  },
];

export const TICKET_INSTRUCTIONS =
  "Doors open at 12:00 PM. Please arrive early to allow time for check-in. " +
  "Each registered party is admitted together.";

export const TEMPLATE_VERSION = TICKET_DOCUMENT_TEMPLATE_VERSION;

/** The event-display columns this configuration owns. */
export interface EventDisplaySnapshot {
  event_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  venue_name: string | null;
  venue_address: string | null;
}

/** The ticket-settings columns this configuration owns. */
export interface TicketSettingsSnapshot {
  display_title: string;
  description: string;
  program_schedule: unknown;
  primary_logo_asset: string;
  template_version: number;
}

function note(
  changes: string[],
  label: string,
  from: unknown,
  to: unknown
): void {
  if (String(from) !== String(to)) {
    changes.push(`${label}: ${String(from)} -> ${String(to)}`);
  }
}

/**
 * Returns the human-readable list of event-display changes needed to reach
 * the target. An empty list means the event already matches.
 */
export function diffEventDisplay(current: EventDisplaySnapshot): string[] {
  const changes: string[] = [];
  note(changes, "Event name", current.event_name, EVENT_NAME);
  note(changes, "Starts at", current.starts_at, EVENT_STARTS_AT);
  note(changes, "Ends at", current.ends_at, EVENT_ENDS_AT);
  note(changes, "Timezone", current.timezone, EVENT_TIMEZONE);
  note(changes, "Venue", current.venue_name, VENUE_NAME);
  note(changes, "Address", current.venue_address, VENUE_ADDRESS);
  return changes;
}

export interface SettingsPlan {
  action: "create" | "update";
  changes: string[];
}

/**
 * Returns the ticket-settings plan. When no row exists the action is
 * "create"; otherwise the action is "update" and an empty change list means
 * the stored settings already match the target.
 */
export function diffTicketSettings(
  current: TicketSettingsSnapshot | null,
  desiredLogoAsset: string
): SettingsPlan {
  if (current === null) {
    return { action: "create", changes: ["Ticket settings: create"] };
  }
  const changes: string[] = [];
  note(changes, "Display title", current.display_title, EVENT_NAME);
  note(
    changes,
    "Description length",
    current.description.length,
    TICKET_DESCRIPTION.length
  );
  note(
    changes,
    "Schedule entries",
    Array.isArray(current.program_schedule)
      ? current.program_schedule.length
      : 0,
    PROGRAM_SCHEDULE.length
  );
  note(changes, "Primary logo asset", current.primary_logo_asset, desiredLogoAsset);
  note(changes, "Template version", current.template_version, TEMPLATE_VERSION);
  return { action: "update", changes };
}
