/**
 * Shared fictional fixtures and fake dependencies for check-in service
 * tests. Every value is fabricated; no real student, staff or ticket data
 * is ever used. The fake world records the arguments forwarded to the
 * atomic database function and returns a canned safe result so mapping,
 * authorization and event-resolution behavior can be tested without any
 * hosted Supabase access.
 */

import { randomUUID } from "node:crypto";

import type { StaffSession } from "@/features/auth/types";
import type { ActiveEventResolution } from "@/features/events/active-event";
import type { ApplyCheckinArgs } from "@/features/checkin/repository";
import type { CheckinServiceDeps } from "@/features/checkin/service";
import type { Json, StaffRole } from "@/types/database";

export const EVENT_ID = "00000000-0000-4000-8000-00000000e001";

export function fictionalCheckinSession(
  role: StaffRole = "scanner",
  overrides: Partial<StaffSession> = {}
): StaffSession {
  return {
    userId: "00000000-0000-4000-8000-0000000000c3",
    email: "fictional.scanner@example.com",
    displayName: "Fictional Scanner",
    role,
    isActive: true,
    mustChangePassword: false,
    ...overrides,
  };
}

function fictionalEventResolution(): ActiveEventResolution {
  return {
    ok: true,
    event: {
      id: EVENT_ID,
      event_code: "GRAD-2026-DEV",
      event_name: "Fictional Graduation Ceremony",
      starts_at: "2026-08-01T17:00:00.000Z",
      ends_at: "2026-08-01T20:00:00.000Z",
      timezone: "America/Toronto",
      venue_name: "Fictional Hall",
      venue_address: "1 Fictional Way",
      status: "active",
      is_test: true,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    },
  };
}

/** A safe successful partial result the fake function returns by default. */
export function partialResult(
  overrides: Record<string, Json> = {}
): Record<string, Json> {
  return {
    ok: true,
    result: "partial",
    idempotent: false,
    graduate_name: "Avery Fictional",
    ticket_code: "GR26-TEST-2345",
    registered_adult_guests: 2,
    registered_children_0_4: 1,
    registered_children_5_10: 1,
    expected_party_size: 5,
    graduate_arriving_now: 1,
    adult_guests_arriving_now: 1,
    children_0_4_arriving_now: 0,
    children_5_10_arriving_now: 0,
    graduate_arrived_before: 0,
    adult_guests_arrived_before: 0,
    children_0_4_arrived_before: 0,
    children_5_10_arrived_before: 0,
    graduate_arrived_total: 1,
    adult_guests_arrived_total: 1,
    children_0_4_arrived_total: 0,
    children_5_10_arrived_total: 0,
    remaining_adult_guests: 1,
    remaining_children_0_4: 1,
    remaining_children_5_10: 1,
    remaining_party_size: 3,
    recorded_at: "2026-08-01T17:05:00.000Z",
    ...overrides,
  };
}

export interface FakeCheckinWorld {
  deps: CheckinServiceDeps;
  calls: ApplyCheckinArgs[];
  setResult(result: Json): void;
  setEvent(resolution: ActiveEventResolution): void;
}

export function fakeCheckinWorld(): FakeCheckinWorld {
  const calls: ApplyCheckinArgs[] = [];
  let result: Json = partialResult();
  let event: ActiveEventResolution = fictionalEventResolution();

  return {
    calls,
    setResult(next: Json) {
      result = next;
    },
    setEvent(next: ActiveEventResolution) {
      event = next;
    },
    deps: {
      resolveActiveEvent: async () => event,
      applyCheckin: async (args) => {
        calls.push(args);
        return result;
      },
    },
  };
}

/** A well-formed confirmation request body. */
export function confirmBody(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    validationAttemptId: randomUUID(),
    requestId: randomUUID(),
    graduateArriving: 1,
    adultGuestsArriving: 1,
    children0To4Arriving: 0,
    children5To10Arriving: 0,
    ...overrides,
  };
}
