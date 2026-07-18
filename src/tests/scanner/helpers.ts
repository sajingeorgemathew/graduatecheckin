/**
 * Shared fictional fixtures and fake dependencies for scanner tests.
 * Every value is fabricated; no real student, staff or ticket data is
 * ever used. The fake secret exists only inside the test process.
 */

import { randomUUID } from "node:crypto";
import type { StaffSession } from "@/features/auth/types";
import type { ActiveEventResolution } from "@/features/events/active-event";
import { buildQrPayload } from "@/features/tickets/qr-payload";
import { buildTicketToken, hashTicketToken } from "@/features/tickets/token";
import type { CheckinDeltaRow } from "@/features/scanner/attendance-summary";
import { DEFAULT_SCAN_RATE_LIMIT } from "@/features/scanner/rate-limit";
import type { ScannerServiceDeps } from "@/features/scanner/service";
import type {
  GraduationEventRow,
  GraduationRegistrationRow,
  GraduationTicketRow,
  StaffRole,
  TicketScanAttemptInsert,
} from "@/types/database";

/** Fabricated test-only signing secret with at least 32 bytes of entropy. */
export const TEST_TICKET_SECRET = Buffer.alloc(32, 7).toString("base64");

export const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
export const OTHER_EVENT_ID = "00000000-0000-4000-8000-00000000e002";
export const REGISTRATION_ID = "00000000-0000-4000-8000-00000000r001";

export function fictionalScannerSession(
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

export function fictionalEvent(
  overrides: Partial<GraduationEventRow> = {}
): GraduationEventRow {
  return {
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
    ...overrides,
  };
}

export function fictionalRegistration(
  overrides: Partial<GraduationRegistrationRow> = {}
): GraduationRegistrationRow {
  return {
    id: REGISTRATION_ID,
    event_id: EVENT_ID,
    registration_code: "REG-FICTIONAL-001",
    source_system: "mock",
    source_registration_id: "MOCK-0001",
    graduate_full_name: "Avery Fictional",
    email: null,
    phone: null,
    gown_size: null,
    name_pronunciation: null,
    registered_adult_guests: 2,
    registered_children_0_4: 1,
    registered_children_5_10: 1,
    expected_party_size: 5,
    registration_status: "eligible",
    payment_status: "paid",
    fee_total: null,
    tax_total: null,
    order_total: null,
    source_order_date: null,
    internal_notes: null,
    is_test: true,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

let ticketCounter = 0;

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Deterministic valid-format test code, unique per generated ticket. */
function fictionalTicketCode(counter: number): string {
  let group = "";
  let remaining = counter;
  for (let i = 0; i < 4; i += 1) {
    group = CODE_ALPHABET[remaining % CODE_ALPHABET.length] + group;
    remaining = Math.floor(remaining / CODE_ALPHABET.length);
  }
  return `GR26-TEST-${group}`;
}

export function fictionalTicket(
  overrides: Partial<GraduationTicketRow> = {}
): GraduationTicketRow {
  ticketCounter += 1;
  const id = overrides.id ?? randomUUID();
  const base: GraduationTicketRow = {
    id,
    registration_id: REGISTRATION_ID,
    ticket_code: fictionalTicketCode(ticketCounter),
    token_hash: hashTicketToken(buildTicketToken(id, TEST_TICKET_SECRET)),
    token_version: 1,
    status: "active",
    issued_at: "2026-07-02T00:00:00.000Z",
    sent_at: null,
    revoked_at: null,
    replaced_by_ticket_id: null,
    generation_batch_id: null,
    issued_by: null,
    revoked_by: null,
    revocation_reason: null,
    is_test: true,
    created_at: "2026-07-02T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
  };
  return { ...base, ...overrides, id };
}

/** Builds the QR payload a real ticket QR code would contain. */
export function payloadForTicket(ticket: GraduationTicketRow): string {
  return buildQrPayload(buildTicketToken(ticket.id, TEST_TICKET_SECRET));
}

export interface FakeScannerWorld {
  deps: ScannerServiceDeps;
  attempts: TicketScanAttemptInsert[];
  tickets: Map<string, GraduationTicketRow>;
  registrations: Map<string, GraduationRegistrationRow>;
  addTicket(ticket: GraduationTicketRow): void;
  codeLookups: string[];
  recentAttemptCount: number;
  setRecentAttemptCount(count: number): void;
}

export interface FakeWorldOptions {
  event?: ActiveEventResolution;
  checkins?: CheckinDeltaRow[];
  now?: () => Date;
}

/**
 * In-memory scanner world. Records every scan attempt, enforces the
 * unique (staff user, request id) constraint like the database does and
 * never touches graduation_checkins beyond returning the provided
 * read-only delta rows.
 */
export function fakeScannerWorld(options: FakeWorldOptions = {}): FakeScannerWorld {
  const tickets = new Map<string, GraduationTicketRow>();
  const registrations = new Map<string, GraduationRegistrationRow>();
  const attempts: TicketScanAttemptInsert[] = [];
  const attemptIds = new Map<string, string>();
  const codeLookups: string[] = [];
  const eventResolution: ActiveEventResolution =
    options.event ?? { ok: true, event: fictionalEvent() };
  const checkins = options.checkins ?? [];

  const world: FakeScannerWorld = {
    attempts,
    tickets,
    registrations,
    codeLookups,
    recentAttemptCount: 0,
    setRecentAttemptCount(count: number) {
      world.recentAttemptCount = count;
    },
    addTicket(ticket: GraduationTicketRow) {
      tickets.set(ticket.id, ticket);
    },
    deps: {
      getTicketSecret: () => TEST_TICKET_SECRET,
      resolveActiveEvent: async () => eventResolution,
      getTicketById: async (ticketId) => tickets.get(ticketId) ?? null,
      getTicketByCode: async (ticketCode) => {
        codeLookups.push(ticketCode);
        for (const ticket of tickets.values()) {
          if (ticket.ticket_code === ticketCode) {
            return ticket;
          }
        }
        return null;
      },
      getRegistrationById: async (registrationId) =>
        registrations.get(registrationId) ?? null,
      listCheckinDeltas: async () => checkins,
      countScanAttemptsSince: async () => world.recentAttemptCount,
      recordScanAttempt: async (attempt) => {
        const key = `${attempt.staff_user_id}:${attempt.request_id}`;
        const existing = attemptIds.get(key);
        if (existing !== undefined) {
          return existing;
        }
        const id = randomUUID();
        attemptIds.set(key, id);
        attempts.push(attempt);
        return id;
      },
      rateLimit: DEFAULT_SCAN_RATE_LIMIT,
      now: options.now ?? (() => new Date("2026-08-01T16:00:00.000Z")),
    },
  };

  registrations.set(REGISTRATION_ID, fictionalRegistration());
  return world;
}

/** A well-formed validation request body. */
export function scanRequest(
  method: "qr" | "manual_code",
  value: string
): { method: "qr" | "manual_code"; value: string; requestId: string } {
  return { method, value, requestId: randomUUID() };
}
