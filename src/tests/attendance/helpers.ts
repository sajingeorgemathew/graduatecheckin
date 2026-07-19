/**
 * Shared fictional fixtures and fake dependencies for attendance service
 * tests. Every value is fabricated; no real student, staff or ticket data is
 * ever used. The fakes let each test set specific repository behavior while
 * recording the arguments forwarded to the atomic database functions, so
 * authorization, event resolution, mapping and privacy can be tested without
 * any hosted Supabase access.
 */

import type { StaffSession } from "@/features/auth/types";
import type { ActiveEventResolution } from "@/features/events/active-event";
import type {
  AttendanceRepository,
  AttendanceServiceDeps,
} from "@/features/attendance/service";
import type { GraduationEventRow, Json, StaffRole } from "@/types/database";

/** A valid 32-byte secret encoded as Base64. */
export const TEST_SECRET = Buffer.alloc(32, 9).toString("base64");

export const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
export const EVENT_CODE = "GRAD-2026-DEV";
export const REGISTRATION_ID = "00000000-0000-4000-8000-0000000000a1";
export const CHECKIN_ID = "00000000-0000-4000-8000-0000000000b1";

export function fictionalSession(
  role: StaffRole = "supervisor",
  overrides: Partial<StaffSession> = {}
): StaffSession {
  return {
    userId: "00000000-0000-4000-8000-0000000000c9",
    email: "fictional.supervisor@example.com",
    displayName: "Fictional Supervisor",
    role,
    isActive: true,
    mustChangePassword: false,
    ...overrides,
  };
}

export function fictionalEvent(): GraduationEventRow {
  return {
    id: EVENT_ID,
    event_code: EVENT_CODE,
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
  };
}

export function okEvent(): ActiveEventResolution {
  return { ok: true, event: fictionalEvent() };
}

/** A safe successful write result the fake RPCs return by default. */
export function okWriteResult(
  overrides: Record<string, Json> = {}
): Record<string, Json> {
  return {
    ok: true,
    idempotent: false,
    graduate_name: "Avery Fictional",
    registered_adult_guests: 2,
    registered_children_0_4: 1,
    registered_children_5_10: 1,
    graduate_arrived_total: 1,
    adult_guests_arrived_total: 1,
    children_0_4_arrived_total: 0,
    children_5_10_arrived_total: 0,
    remaining_adult_guests: 1,
    remaining_children_0_4: 1,
    remaining_children_5_10: 1,
    recorded_at: "2026-08-01T17:05:00.000Z",
    ...overrides,
  };
}

export function fakeRepo(
  overrides: Partial<AttendanceRepository> = {}
): AttendanceRepository {
  return {
    listEligibleRegistrations: async () => [],
    listEligibleDeltasByRegistration: async () => new Map(),
    listRecentActivity: async () => [],
    resolveStaffDisplayNames: async () => new Map(),
    getEventRegistration: async () => null,
    listRegistrations: async () => [],
    searchRegistrationsByName: async () => [],
    searchRegistrationsBySourceId: async () => [],
    findRegistrationByTicketCode: async () => null,
    listDeltasForRegistrations: async () => new Map(),
    currentTicketStatusByRegistration: async () => new Map(),
    listRegistrationCheckins: async () => [],
    applyManualArrivalRpc: async () => okWriteResult(),
    applyCorrectionRpc: async () => okWriteResult(),
    reverseCheckinRpc: async () => okWriteResult(),
    ...overrides,
  };
}

export interface FakeDepsOptions {
  event?: ActiveEventResolution;
  secret?: string;
  repo?: Partial<AttendanceRepository>;
}

export function fakeDeps(options: FakeDepsOptions = {}): AttendanceServiceDeps {
  return {
    resolveActiveEvent: async () => options.event ?? okEvent(),
    signingSecret: () => options.secret ?? TEST_SECRET,
    repo: fakeRepo(options.repo),
  };
}
