import "server-only";

/**
 * Scanner validation service. Runs the complete server-side validation
 * sequence for QR and manual-code scans: authorization, rate limiting,
 * active-event resolution, payload and signature verification, stored
 * token-hash comparison, ticket and registration status evaluation,
 * registration-level attendance calculation and privacy-safe audit
 * recording.
 *
 * CHECKIN-06 validates only. This module never inserts, reverses or
 * modifies graduation_checkins rows. Raw tokens and QR payloads exist
 * only in local variables while a request is validated and are never
 * persisted, logged or returned.
 */

import { timingSafeEqual } from "node:crypto";
import type { StaffSession } from "@/features/auth/types";
import type { ActiveEventResolution } from "@/features/events/active-event";
import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import { parseQrPayload } from "@/features/tickets/qr-payload";
import {
  hashTicketToken,
  validateTicketSecret,
  verifyTicketToken,
} from "@/features/tickets/token";
import { getServerEnv } from "@/lib/env/server";
import type {
  GraduationEventRow,
  GraduationRegistrationRow,
  GraduationTicketRow,
  TicketScanAttemptInsert,
  TicketScanMethod,
  TicketValidationResult,
} from "@/types/database";
import type { AttendanceSummary, CheckinDeltaRow } from "./attendance-summary";
import { summarizeAttendance } from "./attendance-summary";
import {
  scannerConfigError,
  scannerError,
  scannerInternalError,
  scannerInvalidRequestError,
} from "./errors";
import { canUseScanner } from "./permissions";
import {
  DEFAULT_SCAN_RATE_LIMIT,
  isRateLimited,
  rateLimitWindowStart,
  type ScanRateLimitConfig,
} from "./rate-limit";
import {
  countScanAttemptsSince,
  getScannerRegistrationById,
  getScannerTicketByCode,
  getScannerTicketById,
  insertScanAttempt,
  listRegistrationCheckinDeltas,
} from "./repository";
import { resolveReplacementChain } from "./replacement-chain";
import { validateScanSchema, type ValidateScanInput } from "./schemas";
import type { ScanValidationOutcome, ScanValidationView } from "./types";
import {
  evaluateRegistrationStatus,
  evaluateTicketStatus,
  isCompleteTicketCode,
  normalizeManualCode,
} from "./validation";

export interface ScannerServiceDeps {
  getTicketSecret(): string;
  resolveActiveEvent(): Promise<ActiveEventResolution>;
  getTicketById(ticketId: string): Promise<GraduationTicketRow | null>;
  getTicketByCode(ticketCode: string): Promise<GraduationTicketRow | null>;
  getRegistrationById(
    registrationId: string
  ): Promise<GraduationRegistrationRow | null>;
  listCheckinDeltas(registrationId: string): Promise<CheckinDeltaRow[]>;
  countScanAttemptsSince(
    staffUserId: string,
    sinceIso: string
  ): Promise<number>;
  recordScanAttempt(attempt: TicketScanAttemptInsert): Promise<string | null>;
  rateLimit: ScanRateLimitConfig;
  now(): Date;
}

export function getScannerServiceDeps(): ScannerServiceDeps {
  return {
    getTicketSecret: () => getServerEnv().TICKET_TOKEN_SECRET,
    resolveActiveEvent,
    getTicketById: getScannerTicketById,
    getTicketByCode: getScannerTicketByCode,
    getRegistrationById: getScannerRegistrationById,
    listCheckinDeltas: listRegistrationCheckinDeltas,
    countScanAttemptsSince,
    recordScanAttempt: insertScanAttempt,
    rateLimit: DEFAULT_SCAN_RATE_LIMIT,
    now: () => new Date(),
  };
}

/** Constant-time comparison of two stored-format token hashes. */
function tokenHashesMatch(computedHex: string, storedHex: string): boolean {
  const computed = Buffer.from(computedHex, "hex");
  const stored = Buffer.from(storedHex, "hex");
  if (computed.length === 0 || computed.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(computed, stored);
}

function emptyView(
  result: TicketValidationResult,
  validatedAt: string
): ScanValidationView {
  return {
    result,
    validationAttemptId: null,
    graduateName: null,
    ticketCode: null,
    ticketStatus: null,
    registrationStatus: null,
    eventName: null,
    eventStartsAt: null,
    venueName: null,
    registeredAdultGuests: null,
    registeredChildren0To4: null,
    registeredChildren5To10: null,
    expectedPartySize: null,
    graduateArrived: null,
    adultGuestsArrived: null,
    children0To4Arrived: null,
    children5To10Arrived: null,
    remainingPartySize: null,
    latestReplacementTicketCode: null,
    latestReplacementStatus: null,
    validatedAt,
  };
}

interface ResolvedScanTarget {
  ticket: GraduationTicketRow;
  registration: GraduationRegistrationRow;
}

interface AttemptContext {
  deps: ScannerServiceDeps;
  session: StaffSession;
  method: TicketScanMethod;
  requestId: string;
  eventId: string | null;
}

/** Records one privacy-safe attempt row for a validation response. */
async function recordAttempt(
  context: AttemptContext,
  result: TicketValidationResult,
  target: ResolvedScanTarget | null,
  summary: AttendanceSummary | null
): Promise<string | null> {
  const attempt: TicketScanAttemptInsert = {
    event_id: context.eventId,
    ticket_id: target?.ticket.id ?? null,
    registration_id: target?.registration.id ?? null,
    staff_user_id: context.session.userId,
    method: context.method,
    result,
    request_id: context.requestId,
    ticket_status_snapshot: target?.ticket.status ?? null,
    registration_status_snapshot:
      target?.registration.registration_status ?? null,
    graduate_arrived_snapshot: summary?.graduateArrived ?? null,
    adult_guests_arrived_snapshot: summary?.adultGuestsArrived ?? null,
    children_0_4_arrived_snapshot: summary?.children0To4Arrived ?? null,
    children_5_10_arrived_snapshot: summary?.children5To10Arrived ?? null,
  };
  return context.deps.recordScanAttempt(attempt);
}

async function finishResult(
  context: AttemptContext,
  status: number,
  view: ScanValidationView,
  target: ResolvedScanTarget | null,
  summary: AttendanceSummary | null
): Promise<ScanValidationOutcome> {
  const attemptId = await recordAttempt(context, view.result, target, summary);
  return {
    kind: "result",
    status,
    view: { ...view, validationAttemptId: attemptId },
  };
}

/**
 * Resolves the scanned value to a ticket row, or an invalid view. The
 * response never reveals whether the prefix, signature, hash comparison
 * or database lookup specifically failed.
 */
async function resolveTicket(
  deps: ScannerServiceDeps,
  input: ValidateScanInput
): Promise<GraduationTicketRow | null> {
  if (input.method === "manual_code") {
    const code = normalizeManualCode(input.value);
    if (!isCompleteTicketCode(code)) {
      return null;
    }
    return deps.getTicketByCode(code);
  }

  const parsed = parseQrPayload(input.value);
  if (!parsed.ok) {
    return null;
  }
  const verification = verifyTicketToken(parsed.token, deps.getTicketSecret());
  if (!verification.valid) {
    return null;
  }
  const ticket = await deps.getTicketById(verification.ticketId);
  if (ticket === null) {
    return null;
  }
  const computedHash = hashTicketToken(parsed.token);
  if (!tokenHashesMatch(computedHash, ticket.token_hash)) {
    // A correctly signed token whose hash no longer matches the stored
    // hash is rejected exactly like an unknown ticket.
    return null;
  }
  return ticket;
}

function attendanceResult(
  summary: AttendanceSummary
): TicketValidationResult {
  if (summary.state === "full") {
    return "already_checked_in";
  }
  if (summary.state === "partial") {
    return "partially_checked_in";
  }
  return "valid";
}

export async function validateScan(
  deps: ScannerServiceDeps,
  session: StaffSession,
  body: unknown
): Promise<ScanValidationOutcome> {
  if (!canUseScanner(session.role) || !session.isActive) {
    return scannerError(
      403,
      "not_authorized",
      "Scanner access requires an active staff account."
    );
  }

  const parsed = validateScanSchema.safeParse(body);
  if (!parsed.success) {
    // The request id is unverified here, so no attempt row is recorded.
    return scannerInvalidRequestError();
  }
  const input = parsed.data;
  const validatedAt = deps.now().toISOString();

  const context: AttemptContext = {
    deps,
    session,
    method: input.method,
    requestId: input.requestId,
    eventId: null,
  };

  try {
    const windowStart = rateLimitWindowStart(deps.now(), deps.rateLimit);
    const recentCount = await deps.countScanAttemptsSince(
      session.userId,
      windowStart.toISOString()
    );
    if (isRateLimited(recentCount, deps.rateLimit)) {
      // Recorded without any scanned data: no ticket, no registration.
      return finishResult(
        context,
        429,
        emptyView("rate_limited", validatedAt),
        null,
        null
      );
    }

    const activeEvent = await deps.resolveActiveEvent();
    if (!activeEvent.ok) {
      // A missing, closed or archived configured event fails safely.
      await recordAttempt(context, "error", null, null);
      return scannerConfigError();
    }
    const event: GraduationEventRow = activeEvent.event;
    context.eventId = event.id;

    if (
      input.method === "qr" &&
      !validateTicketSecret(deps.getTicketSecret()).valid
    ) {
      await recordAttempt(context, "error", null, null);
      return scannerConfigError();
    }

    const ticket = await resolveTicket(deps, input);
    if (ticket === null) {
      return finishResult(
        context,
        200,
        emptyView("invalid", validatedAt),
        null,
        null
      );
    }

    const registration = await deps.getRegistrationById(
      ticket.registration_id
    );
    if (registration === null) {
      return finishResult(
        context,
        200,
        emptyView("invalid", validatedAt),
        null,
        null
      );
    }
    const target: ResolvedScanTarget = { ticket, registration };

    if (registration.event_id !== event.id) {
      // No details from the other event are revealed.
      return finishResult(
        context,
        200,
        {
          ...emptyView("wrong_event", validatedAt),
          ticketCode: ticket.ticket_code,
          ticketStatus: ticket.status,
        },
        target,
        null
      );
    }

    const ticketEvaluation = evaluateTicketStatus(ticket.status);
    if (ticketEvaluation.kind === "revoked") {
      return finishResult(
        context,
        200,
        {
          ...emptyView("revoked", validatedAt),
          graduateName: registration.graduate_full_name,
          ticketCode: ticket.ticket_code,
          ticketStatus: ticket.status,
        },
        target,
        null
      );
    }
    if (ticketEvaluation.kind === "replaced") {
      const chain = await resolveReplacementChain(ticket, deps.getTicketById);
      return finishResult(
        context,
        200,
        {
          ...emptyView("replaced", validatedAt),
          graduateName: registration.graduate_full_name,
          ticketCode: ticket.ticket_code,
          ticketStatus: ticket.status,
          latestReplacementTicketCode: chain.ok
            ? chain.latestTicketCode
            : null,
          latestReplacementStatus: chain.ok ? chain.latestStatus : null,
        },
        target,
        null
      );
    }
    if (ticketEvaluation.kind === "pending") {
      return finishResult(
        context,
        200,
        {
          ...emptyView("pending", validatedAt),
          graduateName: registration.graduate_full_name,
          ticketCode: ticket.ticket_code,
          ticketStatus: ticket.status,
        },
        target,
        null
      );
    }

    if (
      evaluateRegistrationStatus(registration.registration_status).kind ===
      "blocked"
    ) {
      return finishResult(
        context,
        200,
        {
          ...emptyView("registration_blocked", validatedAt),
          graduateName: registration.graduate_full_name,
          ticketCode: ticket.ticket_code,
          ticketStatus: ticket.status,
          registrationStatus: registration.registration_status,
        },
        target,
        null
      );
    }

    // Attendance always spans every check-in row of the registration, so
    // a replaced ticket can never reset previously recorded arrivals.
    const checkins = await deps.listCheckinDeltas(registration.id);
    const summary = summarizeAttendance(
      {
        adultGuests: registration.registered_adult_guests,
        children0To4: registration.registered_children_0_4,
        children5To10: registration.registered_children_5_10,
      },
      checkins
    );

    return finishResult(
      context,
      200,
      {
        ...emptyView(attendanceResult(summary), validatedAt),
        graduateName: registration.graduate_full_name,
        ticketCode: ticket.ticket_code,
        ticketStatus: ticket.status,
        registrationStatus: registration.registration_status,
        eventName: event.event_name,
        eventStartsAt: event.starts_at,
        venueName: event.venue_name,
        registeredAdultGuests: registration.registered_adult_guests,
        registeredChildren0To4: registration.registered_children_0_4,
        registeredChildren5To10: registration.registered_children_5_10,
        expectedPartySize: summary.expectedPartySize,
        graduateArrived: summary.graduateArrived,
        adultGuestsArrived: summary.adultGuestsArrived,
        children0To4Arrived: summary.children0To4Arrived,
        children5To10Arrived: summary.children5To10Arrived,
        remainingPartySize: summary.remainingPartySize,
      },
      target,
      summary
    );
  } catch {
    // No request values, tokens or database errors are ever logged or
    // returned from this path.
    return scannerInternalError();
  }
}
