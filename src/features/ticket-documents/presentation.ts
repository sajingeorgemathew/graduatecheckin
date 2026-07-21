/**
 * Turns database rows into the shapes the PDF renders.
 *
 * Kept free of database and filesystem access so it is unit testable and so
 * the fingerprint and the rendered page are always derived from exactly the
 * same normalized values.
 *
 * All times are formatted in the event's timezone (America/Toronto for the
 * 2026 convocation), never in the server's local timezone.
 */

import type {
  GraduationEventRow,
  GraduationEventTicketSettingsRow,
  Json,
} from "@/types/database";

import { TICKET_DOCUMENT_TEMPLATE_VERSION } from "./constants";
import type {
  ProgramScheduleEntry,
  RegisteredParty,
  TicketDocumentSettings,
  TicketEventDetails,
} from "./types";

/** Formats a timestamp as a long date in the given timezone. */
export function formatEventDate(
  isoTimestamp: string | null,
  timezone: string
): string {
  if (isoTimestamp === null) {
    return "Date to be confirmed";
  }
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return "Date to be confirmed";
  }
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(date);
}

/** Formats a timestamp as a 12-hour clock time in the given timezone. */
export function formatEventTime(
  isoTimestamp: string | null,
  timezone: string
): string {
  if (isoTimestamp === null) {
    return "Time to be confirmed";
  }
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return "Time to be confirmed";
  }
  // en-US produces "12:00 PM"; en-CA can produce a 24-hour clock.
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  })
    .format(date)
    // Normalize narrow/non-breaking spaces so matching stays predictable.
    .replace(/ | /g, " ");
}

export function buildEventDetails(event: GraduationEventRow): TicketEventDetails {
  return {
    title: event.event_name,
    dateLabel: formatEventDate(event.starts_at, event.timezone),
    startLabel: formatEventTime(event.starts_at, event.timezone),
    endLabel: formatEventTime(event.ends_at, event.timezone),
    timezone: event.timezone,
    venueName: event.venue_name ?? "Venue to be confirmed",
    venueAddress: event.venue_address ?? "",
  };
}

/**
 * Parses the stored program schedule. Malformed entries are dropped rather
 * than rendered, so a bad settings row can never print nonsense on a
 * ticket.
 */
export function parseProgramSchedule(value: Json): ProgramScheduleEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: ProgramScheduleEntry[] = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const record = raw as { [key: string]: Json | undefined };
    const startTime = record.start_time;
    const endTime = record.end_time;
    const title = record.title;
    if (
      typeof startTime !== "string" ||
      typeof endTime !== "string" ||
      typeof title !== "string" ||
      title.trim().length === 0
    ) {
      continue;
    }
    entries.push({
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      title: title.trim(),
    });
  }
  return entries;
}

/** Serializes a schedule back to the stored JSON shape. */
export function serializeProgramSchedule(
  entries: readonly ProgramScheduleEntry[]
): Json {
  return entries.map((entry) => ({
    start_time: entry.startTime,
    end_time: entry.endTime,
    title: entry.title,
  })) as unknown as Json;
}

export function buildTicketSettings(
  row: GraduationEventTicketSettingsRow
): TicketDocumentSettings {
  return {
    displayTitle: row.display_title,
    description: row.description,
    programSchedule: parseProgramSchedule(row.program_schedule),
    primaryLogoAsset: row.primary_logo_asset,
    secondaryAsset: row.secondary_asset,
    templateVersion: row.template_version,
    instructions: row.instructions,
  };
}

/**
 * Settings used when an event has no ticket-settings row yet, so a preview
 * never crashes. Generation requires a real configured row.
 */
export function fallbackTicketSettings(
  event: GraduationEventRow
): TicketDocumentSettings {
  return {
    displayTitle: event.event_name,
    description: "",
    programSchedule: [],
    primaryLogoAsset: "logo_final_full.png",
    secondaryAsset: null,
    templateVersion: TICKET_DOCUMENT_TEMPLATE_VERSION,
    instructions: null,
  };
}

/**
 * Snapshot of the registered party stored with the document. Presentation
 * data only: no contact details and no credential material.
 */
export function partySnapshot(party: RegisteredParty): Json {
  return {
    graduate_name: party.graduateName,
    graduate_count: party.graduateCount,
    adult_guest_names: party.adultGuestNames,
    adult_guest_count: party.adultGuestCount,
    child_0_4_count: party.children04Count,
    child_5_10_count: party.children510Count,
    total_party_count: party.totalPartyCount,
  } as unknown as Json;
}

/** Snapshot of the event facts printed on the document. */
export function eventSnapshot(
  event: TicketEventDetails,
  settings: TicketDocumentSettings
): Json {
  return {
    title: event.title,
    date_label: event.dateLabel,
    start_label: event.startLabel,
    end_label: event.endLabel,
    timezone: event.timezone,
    venue_name: event.venueName,
    venue_address: event.venueAddress,
    display_title: settings.displayTitle,
    program_schedule: serializeProgramSchedule(settings.programSchedule),
  } as unknown as Json;
}

/** Long date used for the printed issue date. */
export function formatIssuedAt(isoTimestamp: string, timezone: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(date);
}
