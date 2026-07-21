/**
 * Synthetic fixtures for the ticket-document tests.
 *
 * Every value here is invented. No real graduate name, email address,
 * phone number, ticket code or other real student data appears in any
 * test in this suite.
 */

import { randomBytes } from "node:crypto";

import { buildRegisteredParty } from "@/features/ticket-documents/party";
import type {
  GuestRecordInput,
  RegistrationPartyInput,
} from "@/features/ticket-documents/party";
import type {
  ProgramScheduleEntry,
  RegisteredParty,
  TicketDocumentSettings,
  TicketEventDetails,
} from "@/features/ticket-documents/types";

export const TEST_SECRET = randomBytes(48).toString("base64");

export const TEST_TICKET_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
export const TEST_TICKET_ID_2 = "aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff";
export const TEST_REGISTRATION_ID = "11111111-2222-4333-8444-555555555555";
export const TEST_EVENT_ID = "99999999-8888-4777-8666-555555555555";

export const TEST_TICKET_CODE = "TAE-9F4K-2QX7";

export const TEST_SCHEDULE: ProgramScheduleEntry[] = [
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

export const TEST_DESCRIPTION =
  "Celebrate this important milestone with Toronto Academy of Education " +
  "at Convocation Ceremony 2026. This single admission ticket covers the " +
  "graduate and all registered guests shown on this ticket. No separate " +
  "guest ticket is required. Save the PDF on your phone or bring a " +
  "printed copy and present the QR code at check-in.";

export const TEST_EVENT: TicketEventDetails = {
  title: "Convocation Ceremony 2026",
  dateLabel: "Sunday, July 26, 2026",
  startLabel: "12:00 PM",
  endLabel: "4:00 PM",
  timezone: "America/Toronto",
  venueName: "Mississauga Grand Banquet & Event Centre",
  venueAddress: "35 Brunel Road, Mississauga, ON L4Z 3E8",
};

export const TEST_SETTINGS: TicketDocumentSettings = {
  displayTitle: "Convocation Ceremony 2026",
  description: TEST_DESCRIPTION,
  programSchedule: TEST_SCHEDULE,
  primaryLogoAsset: "logo_final_full.png",
  secondaryAsset: null,
  templateVersion: 1,
  instructions:
    "Doors open at 12:00 PM. Please arrive early to allow time for " +
    "check-in. Each registered party is admitted together.",
};

/** Builds a synthetic registered party from counts and optional names. */
export function makeParty(
  overrides: Partial<RegistrationPartyInput> = {},
  guests: GuestRecordInput[] = []
): RegisteredParty {
  const registration: RegistrationPartyInput = {
    graduateFullName: "Avery Testerton",
    registeredAdultGuests: 0,
    registeredChildren04: 0,
    registeredChildren510: 0,
    ...overrides,
  };
  return buildRegisteredParty(registration, guests);
}

export function adultGuest(
  guestName: string | null,
  sortOrder: number
): GuestRecordInput {
  return { guestCategory: "adult", guestName, sortOrder };
}

export function childGuest(
  category: "child_0_4" | "child_5_10",
  sortOrder: number
): GuestRecordInput {
  return { guestCategory: category, guestName: null, sortOrder };
}
