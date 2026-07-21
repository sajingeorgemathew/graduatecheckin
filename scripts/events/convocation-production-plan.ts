/**
 * Runtime-neutral production-event constants for CONVOCATION-2026.
 *
 * These are the approved ceremony details for the real event, kept separate
 * from the GRAD-2026-DEV test event. This module contains no database access
 * and no secret, so both the create script and its tests can import it.
 *
 * The ceremony display values are re-exported from the CHECKIN-09A
 * configure-plan so the printed production ticket stays identical to what
 * was approved there; only the event code, mode and status differ.
 */

import {
  EVENT_ENDS_AT,
  EVENT_NAME,
  EVENT_STARTS_AT,
  EVENT_TIMEZONE,
  PROGRAM_SCHEDULE,
  TEMPLATE_VERSION,
  TICKET_DESCRIPTION,
  TICKET_INSTRUCTIONS,
  VENUE_ADDRESS,
  VENUE_NAME,
} from "../tickets/configure-plan";
import type { ProgramScheduleEntry } from "../../src/features/ticket-documents/types";

export const PRODUCTION_EVENT_CODE = "CONVOCATION-2026";
export const DEV_EVENT_CODE = "GRAD-2026-DEV";

export interface ProductionEventDetails {
  eventName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venueName: string;
  venueAddress: string;
  description: string;
  instructions: string | null;
  templateVersion: number;
  programSchedule: ProgramScheduleEntry[];
}

export const PRODUCTION_EVENT_DETAILS: ProductionEventDetails = {
  eventName: EVENT_NAME,
  startsAt: EVENT_STARTS_AT,
  endsAt: EVENT_ENDS_AT,
  timezone: EVENT_TIMEZONE,
  venueName: VENUE_NAME,
  venueAddress: VENUE_ADDRESS,
  description: TICKET_DESCRIPTION,
  instructions: TICKET_INSTRUCTIONS,
  templateVersion: TEMPLATE_VERSION,
  programSchedule: PROGRAM_SCHEDULE,
};
