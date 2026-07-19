import "server-only";

/**
 * Attendance service. Runs the server-side supervisor workflow: supervisor
 * level authorization, strict input validation, server-side active event
 * resolution, signed registration and entry references and the atomic
 * database functions. All attendance recording, locking, recalculation and
 * allowance enforcement happen inside the database transaction; this module
 * forwards trusted arguments and maps safe results to browser-safe views.
 *
 * The browser never supplies an event, actor or registration UUID. The
 * acting user comes from the trusted session; the event is resolved from the
 * server-only active event code; a registration or entry is addressed only
 * by a short-lived signed reference this module verifies before use.
 */

import { getServerEnv } from "@/lib/env/server";
import type { StaffSession } from "@/features/auth/types";
import type { ActiveEventResolution } from "@/features/events/active-event";
import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import type { GraduationEventRow, Json } from "@/types/database";
import {
  createEntryReference,
  createRegistrationReference,
  verifyRegistrationReference,
  type ReferenceVerification,
} from "./action-token";
import {
  calculateRegistrationAttendance,
  type AttendanceClassification,
  type AttendanceDeltaRow,
  type PartyTotals,
  type RegisteredParty,
} from "./calculations";
import {
  MAX_SEARCH_RESULTS,
  MIN_NAME_SEARCH_LENGTH,
  RECENT_ACTIVITY_LIMIT,
  SEARCH_CANDIDATE_CAP,
} from "./constants";
import {
  filtersAreDefault,
  type AttendanceFilters,
} from "./filters";
import {
  attendanceError,
  configurationError,
  expiredReferenceError,
  internalError,
  invalidReferenceError,
  invalidRequestError,
  mapDatabaseCode,
  unauthorizedError,
} from "./errors";
import { canManageAttendance } from "./permissions";
import * as repo from "./repository";
import { buildAttendanceAggregates } from "./summaries";
import { detailSchema, searchSchema } from "./schemas";
import { isValidTicketCode } from "@/features/tickets/ticket-code";
import type {
  AttendanceDetailView,
  AttendanceOutcome,
  AttendanceSearchView,
  AttendanceSummaryView,
  AttendanceWriteView,
} from "./types";

export interface AttendanceRepository {
  listEligibleRegistrations: typeof repo.listEligibleRegistrations;
  listEligibleDeltasByRegistration: typeof repo.listEligibleDeltasByRegistration;
  listRecentActivity: typeof repo.listRecentActivity;
  resolveStaffDisplayNames: typeof repo.resolveStaffDisplayNames;
  getEventRegistration: typeof repo.getEventRegistration;
  listRegistrations: typeof repo.listRegistrations;
  searchRegistrationsByName: typeof repo.searchRegistrationsByName;
  searchRegistrationsBySourceId: typeof repo.searchRegistrationsBySourceId;
  findRegistrationByTicketCode: typeof repo.findRegistrationByTicketCode;
  listDeltasForRegistrations: typeof repo.listDeltasForRegistrations;
  currentTicketStatusByRegistration: typeof repo.currentTicketStatusByRegistration;
  listRegistrationCheckins: typeof repo.listRegistrationCheckins;
  applyManualArrivalRpc: typeof repo.applyManualArrivalRpc;
  applyCorrectionRpc: typeof repo.applyCorrectionRpc;
  reverseCheckinRpc: typeof repo.reverseCheckinRpc;
}

export interface AttendanceServiceDeps {
  resolveActiveEvent(): Promise<ActiveEventResolution>;
  signingSecret(): string;
  repo: AttendanceRepository;
}

export function getAttendanceServiceDeps(): AttendanceServiceDeps {
  return {
    resolveActiveEvent,
    signingSecret: () => getServerEnv().TICKET_TOKEN_SECRET,
    repo: {
      listEligibleRegistrations: repo.listEligibleRegistrations,
      listEligibleDeltasByRegistration: repo.listEligibleDeltasByRegistration,
      listRecentActivity: repo.listRecentActivity,
      resolveStaffDisplayNames: repo.resolveStaffDisplayNames,
      getEventRegistration: repo.getEventRegistration,
      listRegistrations: repo.listRegistrations,
      searchRegistrationsByName: repo.searchRegistrationsByName,
      searchRegistrationsBySourceId: repo.searchRegistrationsBySourceId,
      findRegistrationByTicketCode: repo.findRegistrationByTicketCode,
      listDeltasForRegistrations: repo.listDeltasForRegistrations,
      currentTicketStatusByRegistration: repo.currentTicketStatusByRegistration,
      listRegistrationCheckins: repo.listRegistrationCheckins,
      applyManualArrivalRpc: repo.applyManualArrivalRpc,
      applyCorrectionRpc: repo.applyCorrectionRpc,
      reverseCheckinRpc: repo.reverseCheckinRpc,
    },
  };
}

// --- shared helpers, exported for the write-operation modules and tests ---

export function isAuthorized(session: StaffSession): boolean {
  return canManageAttendance(session.role) && session.isActive;
}

export function asRecord(value: Json): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function numberField(rec: Record<string, unknown>, key: string): number {
  const value = rec[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringOrNull(rec: Record<string, unknown>, key: string): string | null {
  const value = rec[key];
  return typeof value === "string" ? value : null;
}

const STAFF_FALLBACK_NAME = "Staff member";

function registeredFrom(registration: repo.RegistrationRecord): RegisteredParty {
  return {
    adultGuests: registration.registeredAdultGuests,
    children0To4: registration.registeredChildren0To4,
    children5To10: registration.registeredChildren5To10,
  };
}

function classify(
  arrivedTotal: number,
  expectedTotal: number
): AttendanceClassification {
  if (arrivedTotal <= 0) {
    return "not_arrived";
  }
  if (arrivedTotal >= expectedTotal) {
    return "complete";
  }
  return "partial";
}

/** Builds the safe write view from a successful database result. */
export function buildWriteView(
  rec: Record<string, unknown>
): AttendanceWriteView {
  const registered: PartyTotals = {
    graduate: 1,
    adultGuests: numberField(rec, "registered_adult_guests"),
    children0To4: numberField(rec, "registered_children_0_4"),
    children5To10: numberField(rec, "registered_children_5_10"),
  };
  const arrived: PartyTotals = {
    graduate: numberField(rec, "graduate_arrived_total"),
    adultGuests: numberField(rec, "adult_guests_arrived_total"),
    children0To4: numberField(rec, "children_0_4_arrived_total"),
    children5To10: numberField(rec, "children_5_10_arrived_total"),
  };
  const remaining: PartyTotals = {
    graduate: registered.graduate - arrived.graduate,
    adultGuests: registered.adultGuests - arrived.adultGuests,
    children0To4: registered.children0To4 - arrived.children0To4,
    children5To10: registered.children5To10 - arrived.children5To10,
  };
  const expectedTotal =
    registered.graduate +
    registered.adultGuests +
    registered.children0To4 +
    registered.children5To10;
  const arrivedTotal =
    arrived.graduate +
    arrived.adultGuests +
    arrived.children0To4 +
    arrived.children5To10;
  return {
    graduateName: stringOrNull(rec, "graduate_name"),
    registered,
    arrived,
    remaining,
    classification: classify(arrivedTotal, expectedTotal),
  };
}

/** Maps an atomic write result to an outcome shared by all three writes. */
export function mapWriteResult(
  raw: Json
): AttendanceOutcome<AttendanceWriteView> {
  const rec = asRecord(raw);
  if (rec === null) {
    return internalError();
  }
  if (rec.ok === true) {
    return { kind: "result", status: 200, view: buildWriteView(rec) };
  }
  const code = stringOrNull(rec, "code");
  if (code === null) {
    return internalError();
  }
  const mapping = mapDatabaseCode(code);
  return attendanceError(mapping.status, code, mapping.message);
}

/** Resolves the active event or a shared failure outcome. */
export async function resolveEventOrFailure<TView>(
  deps: AttendanceServiceDeps
): Promise<
  | { ok: true; event: GraduationEventRow }
  | { ok: false; outcome: AttendanceOutcome<TView> }
> {
  const resolution = await deps.resolveActiveEvent();
  if (!resolution.ok) {
    return { ok: false, outcome: configurationError() };
  }
  return { ok: true, event: resolution.event };
}

/** Converts a reference verification into a registration/entry id or a
 * shared failure outcome. */
export function referenceOrFailure<TView>(
  verification: ReferenceVerification
): { ok: true; id: string } | { ok: false; outcome: AttendanceOutcome<TView> } {
  if (verification.valid) {
    return { ok: true, id: verification.id };
  }
  if (verification.reason === "expired") {
    return { ok: false, outcome: expiredReferenceError() };
  }
  return { ok: false, outcome: invalidReferenceError() };
}

// --- read operations ---

export async function loadSummary(
  deps: AttendanceServiceDeps,
  session: StaffSession
): Promise<AttendanceOutcome<AttendanceSummaryView>> {
  if (!isAuthorized(session)) {
    return unauthorizedError();
  }
  try {
    const resolved = await resolveEventOrFailure<AttendanceSummaryView>(deps);
    if (!resolved.ok) {
      return resolved.outcome;
    }
    const eventId = resolved.event.id;

    const [registrations, deltasByRegistration, activity] = await Promise.all([
      deps.repo.listEligibleRegistrations(eventId),
      deps.repo.listEligibleDeltasByRegistration(eventId),
      deps.repo.listRecentActivity(eventId, RECENT_ACTIVITY_LIMIT),
    ]);

    const aggregates = buildAttendanceAggregates(
      registrations.map((registration) => ({
        registered: registeredFrom(registration),
        rows: deltasByRegistration.get(registration.id) ?? [],
      }))
    );

    const staffIds = activity.flatMap((entry) =>
      [entry.recordedBy, entry.staffUserId].filter(
        (id): id is string => id !== null
      )
    );
    const staffNames = await deps.repo.resolveStaffDisplayNames(staffIds);

    const view: AttendanceSummaryView = {
      generatedAt: new Date().toISOString(),
      eligibleRegistrations: aggregates.eligibleRegistrations,
      graduatesArrived: aggregates.graduatesArrived,
      fullyCheckedIn: aggregates.fullyCheckedIn,
      partiallyCheckedIn: aggregates.partiallyCheckedIn,
      notYetArrived: aggregates.notYetArrived,
      expectedTotalAttendance: aggregates.expectedTotalAttendance,
      totalPeopleArrived: aggregates.totalPeopleArrived,
      remainingExpectedAttendance: aggregates.remainingExpectedAttendance,
      graduates: aggregates.graduates,
      adultGuests: aggregates.adultGuests,
      children0To4: aggregates.children0To4,
      children5To10: aggregates.children5To10,
      recentActivity: activity.map((entry) => {
        const staffId = entry.recordedBy ?? entry.staffUserId ?? "";
        return {
          occurredAt: entry.createdAt,
          graduateName: entry.graduateFullName,
          entryKind: entry.entryKind as AttendanceSummaryView["recentActivity"][number]["entryKind"],
          graduateDelta: entry.graduateDelta,
          adultGuestDelta: entry.adultGuestDelta,
          child0To4Delta: entry.child0To4Delta,
          child5To10Delta: entry.child5To10Delta,
          recordedByName: staffNames.get(staffId) ?? STAFF_FALLBACK_NAME,
          reason: entry.reason,
        };
      }),
    };
    return { kind: "result", status: 200, view };
  } catch {
    return internalError();
  }
}

function buildRegistrationTotals(
  registration: repo.RegistrationRecord,
  rows: readonly AttendanceDeltaRow[]
): {
  registered: PartyTotals;
  arrived: PartyTotals;
  remaining: PartyTotals;
  classification: AttendanceClassification;
} {
  const attendance = calculateRegistrationAttendance(
    rows,
    registeredFrom(registration)
  );
  return {
    registered: attendance.registered,
    arrived: attendance.arrived,
    remaining: attendance.remaining,
    classification: attendance.classification,
  };
}

/**
 * True when a registration passes every active filter. Filtering is always
 * enforced here, server-side; the browser only requests filters. The RSVP
 * filter keeps every registration for both "all" and "signed up" because each
 * graduation registration is an RSVP registration; a "not signed up" option
 * is intentionally unavailable and requires the complete invitation roster,
 * which this schema does not contain.
 */
function matchesSearchFilters(
  registration: repo.RegistrationRecord,
  classification: AttendanceClassification,
  ticketStatus: string | null,
  filters: AttendanceFilters
): boolean {
  if (
    filters.attendanceStatus !== "all" &&
    classification !== filters.attendanceStatus
  ) {
    return false;
  }
  if (
    filters.registrationStatus !== "all" &&
    registration.registrationStatus !== filters.registrationStatus
  ) {
    return false;
  }
  if (
    filters.environment !== "all" &&
    registration.isTest !== (filters.environment === "test")
  ) {
    return false;
  }
  if (filters.ticketStatus !== "all") {
    if (filters.ticketStatus === "none") {
      if (ticketStatus !== null) {
        return false;
      }
    } else if (ticketStatus !== filters.ticketStatus) {
      return false;
    }
  }
  return true;
}

export async function searchRegistrations(
  deps: AttendanceServiceDeps,
  session: StaffSession,
  body: unknown
): Promise<AttendanceOutcome<AttendanceSearchView>> {
  if (!isAuthorized(session)) {
    return unauthorizedError();
  }
  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequestError();
  }
  const input = parsed.data;
  const filters = input.filters;

  try {
    const resolved = await resolveEventOrFailure<AttendanceSearchView>(deps);
    if (!resolved.ok) {
      return resolved.outcome;
    }
    const event = resolved.event;

    // Acquire candidate registrations, either by search term or, when no term
    // is present, by browsing the active filters. An empty term with default
    // filters produces no results, which clears the display.
    let candidates: repo.RegistrationRecord[];
    if (input.term.length > 0) {
      if (input.field === "name") {
        if (input.term.length < MIN_NAME_SEARCH_LENGTH) {
          return attendanceError(
            422,
            "search_too_short",
            "Enter at least two characters to search by name."
          );
        }
        candidates = await deps.repo.searchRegistrationsByName(
          event.id,
          input.term,
          SEARCH_CANDIDATE_CAP
        );
      } else if (input.field === "source_id") {
        candidates = await deps.repo.searchRegistrationsBySourceId(
          event.id,
          input.term,
          SEARCH_CANDIDATE_CAP
        );
      } else {
        // Exact, complete ticket-code search only. An invalid format returns
        // no results and never reveals nearby codes.
        const normalized = input.term.toUpperCase();
        if (isValidTicketCode(normalized)) {
          const match = await deps.repo.findRegistrationByTicketCode(
            event.id,
            normalized
          );
          candidates = match === null ? [] : [match];
        } else {
          candidates = [];
        }
      }
    } else if (!filtersAreDefault(filters)) {
      candidates = await deps.repo.listRegistrations(
        event.id,
        {
          registrationStatus:
            filters.registrationStatus === "all"
              ? null
              : filters.registrationStatus,
          isTest:
            filters.environment === "all"
              ? null
              : filters.environment === "test",
        },
        SEARCH_CANDIDATE_CAP
      );
    } else {
      return {
        kind: "result",
        status: 200,
        view: { results: [], matched: 0, truncated: false },
      };
    }

    const ids = candidates.map((registration) => registration.id);
    const [deltas, ticketStatuses] = await Promise.all([
      deps.repo.listDeltasForRegistrations(ids),
      deps.repo.currentTicketStatusByRegistration(ids),
    ]);

    const secret = deps.signingSecret();
    const filtered = candidates
      .map((registration) => {
        const totals = buildRegistrationTotals(
          registration,
          deltas.get(registration.id) ?? []
        );
        const ticketStatus = ticketStatuses.get(registration.id) ?? null;
        return { registration, totals, ticketStatus };
      })
      .filter((row) =>
        matchesSearchFilters(
          row.registration,
          row.totals.classification,
          row.ticketStatus,
          filters
        )
      );

    const matched = filtered.length;
    const results = filtered.slice(0, MAX_SEARCH_RESULTS).map((row) => ({
      registrationReference: createRegistrationReference(
        row.registration.id,
        event.event_code,
        secret
      ),
      graduateName: row.registration.graduateFullName,
      registrationStatus: row.registration.registrationStatus,
      ticketStatus: row.ticketStatus,
      registered: row.totals.registered,
      arrived: row.totals.arrived,
      remaining: row.totals.remaining,
      classification: row.totals.classification,
    }));

    return {
      kind: "result",
      status: 200,
      view: { results, matched, truncated: matched > results.length },
    };
  } catch {
    return internalError();
  }
}

export async function loadDetail(
  deps: AttendanceServiceDeps,
  session: StaffSession,
  body: unknown
): Promise<AttendanceOutcome<AttendanceDetailView>> {
  if (!isAuthorized(session)) {
    return unauthorizedError();
  }
  const parsed = detailSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequestError();
  }

  try {
    const resolved = await resolveEventOrFailure<AttendanceDetailView>(deps);
    if (!resolved.ok) {
      return resolved.outcome;
    }
    const event = resolved.event;
    const secret = deps.signingSecret();

    const reference = referenceOrFailure<AttendanceDetailView>(
      verifyRegistrationReference(
        parsed.data.registrationReference,
        event.event_code,
        secret
      )
    );
    if (!reference.ok) {
      return reference.outcome;
    }

    const registration = await deps.repo.getEventRegistration(
      event.id,
      reference.id
    );
    if (registration === null) {
      return attendanceError(
        404,
        "not_found",
        "That registration could not be found. Search again."
      );
    }

    const [checkins, ticketStatuses] = await Promise.all([
      deps.repo.listRegistrationCheckins(registration.id),
      deps.repo.currentTicketStatusByRegistration([registration.id]),
    ]);

    const staffIds = checkins.flatMap((entry) =>
      [entry.recordedBy, entry.staffUserId].filter(
        (id): id is string => id !== null
      )
    );
    const staffNames = await deps.repo.resolveStaffDisplayNames(staffIds);

    const reversedOriginals = new Set(
      checkins
        .map((entry) => entry.reversesCheckinId)
        .filter((id): id is string => id !== null)
    );

    const totals = buildRegistrationTotals(
      registration,
      checkins.map((entry) => ({
        graduate_delta: entry.graduateDelta,
        adult_guest_delta: entry.adultGuestDelta,
        child_0_4_delta: entry.child0To4Delta,
        child_5_10_delta: entry.child5To10Delta,
      }))
    );

    const history = checkins.map((entry) => {
      const isReversal = entry.entryKind === "reversal";
      const reversed = reversedOriginals.has(entry.id);
      const reversible = !isReversal && !reversed;
      const staffId = entry.recordedBy ?? entry.staffUserId ?? "";
      return {
        entryReference: reversible
          ? createEntryReference(entry.id, event.event_code, secret)
          : null,
        occurredAt: entry.createdAt,
        entryKind: entry.entryKind as AttendanceDetailView["history"][number]["entryKind"],
        graduateDelta: entry.graduateDelta,
        adultGuestDelta: entry.adultGuestDelta,
        child0To4Delta: entry.child0To4Delta,
        child5To10Delta: entry.child5To10Delta,
        recordedByName: staffNames.get(staffId) ?? STAFF_FALLBACK_NAME,
        reason: entry.reason,
        reversed,
        isReversal,
      };
    });

    const view: AttendanceDetailView = {
      registrationReference: createRegistrationReference(
        registration.id,
        event.event_code,
        secret
      ),
      graduateName: registration.graduateFullName,
      registrationStatus: registration.registrationStatus,
      ticketStatus: ticketStatuses.get(registration.id) ?? null,
      registered: totals.registered,
      arrived: totals.arrived,
      remaining: totals.remaining,
      classification: totals.classification,
      history,
    };
    return { kind: "result", status: 200, view };
  } catch {
    return internalError();
  }
}
