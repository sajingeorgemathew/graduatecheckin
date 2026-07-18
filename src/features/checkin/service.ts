import "server-only";

/**
 * Check-in confirmation service. Runs the server-side confirmation flow:
 * scanner-level authorization, strict input validation, server-side active
 * event resolution and the atomic apply_graduation_checkin call. All
 * attendance recording, locking, revalidation and allowance enforcement
 * happen inside the database transaction; this module only forwards
 * trusted arguments and maps the safe jsonb result to a browser-safe view.
 *
 * The browser never supplies an event, ticket, registration or actor id.
 * The acting user comes from the trusted session; the event is resolved
 * from the server-only active event code; the registration is resolved
 * inside the database from the validation attempt alone.
 */

import type { StaffSession } from "@/features/auth/types";
import type { ActiveEventResolution } from "@/features/events/active-event";
import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import type { Json } from "@/types/database";
import { canConfirmCheckin } from "./permissions";
import {
  checkinConfigError,
  checkinInternalError,
  checkinInvalidRequestError,
  checkinUnauthorizedError,
} from "./errors";
import {
  applyGraduationCheckinRpc,
  type ApplyCheckinArgs,
} from "./repository";
import { CHECKIN_RESULT_MESSAGES, checkinResultStatus } from "./response";
import { confirmCheckinSchema } from "./schemas";
import type {
  CheckinConfirmationView,
  CheckinOutcome,
  CheckinResult,
} from "./types";

export interface CheckinServiceDeps {
  resolveActiveEvent(): Promise<ActiveEventResolution>;
  applyCheckin(args: ApplyCheckinArgs): Promise<Json>;
}

export function getCheckinServiceDeps(): CheckinServiceDeps {
  return {
    resolveActiveEvent,
    applyCheckin: applyGraduationCheckinRpc,
  };
}

const RESULT_CODES: ReadonlySet<CheckinResult> = new Set([
  "partial",
  "complete",
  "already_complete",
  "validation_expired",
  "validation_used",
  "ticket_not_active",
  "registration_blocked",
  "wrong_event",
  "invalid_counts",
  "allowance_exceeded",
  "conflict",
  "unauthorized",
  "configuration_error",
]);

function asRecord(value: Json): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function numberField(rec: Record<string, unknown>, key: string): number | null {
  const value = rec[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringField(rec: Record<string, unknown>, key: string): string | null {
  const value = rec[key];
  return typeof value === "string" ? value : null;
}

function toResult(value: string | null): CheckinResult | null {
  if (value !== null && RESULT_CODES.has(value as CheckinResult)) {
    return value as CheckinResult;
  }
  return null;
}

/**
 * Builds the safe view from the database result. Missing numeric fields
 * become null. No validation-attempt id, database UUID, token, contact or
 * payment value is ever read or included.
 */
function buildView(
  rec: Record<string, unknown>,
  result: CheckinResult
): CheckinConfirmationView {
  return {
    result,
    message: CHECKIN_RESULT_MESSAGES[result],
    graduateName: stringField(rec, "graduate_name"),
    ticketCode: stringField(rec, "ticket_code"),
    registeredGraduate: 1,
    registeredAdultGuests: numberField(rec, "registered_adult_guests"),
    registeredChildren0To4: numberField(rec, "registered_children_0_4"),
    registeredChildren5To10: numberField(rec, "registered_children_5_10"),
    expectedPartySize: numberField(rec, "expected_party_size"),
    graduateArrivedBefore: numberField(rec, "graduate_arrived_before"),
    adultGuestsArrivedBefore: numberField(rec, "adult_guests_arrived_before"),
    children0To4ArrivedBefore: numberField(rec, "children_0_4_arrived_before"),
    children5To10ArrivedBefore: numberField(
      rec,
      "children_5_10_arrived_before"
    ),
    graduateArrivingNow: numberField(rec, "graduate_arriving_now"),
    adultGuestsArrivingNow: numberField(rec, "adult_guests_arriving_now"),
    children0To4ArrivingNow: numberField(rec, "children_0_4_arriving_now"),
    children5To10ArrivingNow: numberField(rec, "children_5_10_arriving_now"),
    graduateArrivedTotal: numberField(rec, "graduate_arrived_total"),
    adultGuestsArrivedTotal: numberField(rec, "adult_guests_arrived_total"),
    children0To4ArrivedTotal: numberField(rec, "children_0_4_arrived_total"),
    children5To10ArrivedTotal: numberField(rec, "children_5_10_arrived_total"),
    remainingAdultGuests: numberField(rec, "remaining_adult_guests"),
    remainingChildren0To4: numberField(rec, "remaining_children_0_4"),
    remainingChildren5To10: numberField(rec, "remaining_children_5_10"),
    remainingPartySize: numberField(rec, "remaining_party_size"),
    recordedAt: stringField(rec, "recorded_at"),
  };
}

/** Maps the atomic function result to an HTTP outcome. */
export function mapCheckinResult(raw: Json): CheckinOutcome {
  const rec = asRecord(raw);
  if (rec === null) {
    return checkinInternalError();
  }
  if (rec.ok === true) {
    const result = toResult(stringField(rec, "result"));
    if (result !== "partial" && result !== "complete") {
      return checkinInternalError();
    }
    return { kind: "result", status: 200, view: buildView(rec, result) };
  }
  const code = toResult(stringField(rec, "code"));
  if (code === null) {
    return checkinInternalError();
  }
  return {
    kind: "result",
    status: checkinResultStatus(code),
    view: buildView(rec, code),
  };
}

export async function confirmCheckin(
  deps: CheckinServiceDeps,
  session: StaffSession,
  body: unknown
): Promise<CheckinOutcome> {
  // Defense in depth: the route guard also authorizes, and the database
  // function verifies active scanner-level staff independently.
  if (!canConfirmCheckin(session.role) || !session.isActive) {
    return checkinUnauthorizedError();
  }

  const parsed = confirmCheckinSchema.safeParse(body);
  if (!parsed.success) {
    return checkinInvalidRequestError();
  }
  const input = parsed.data;

  try {
    // The event is resolved from the server-only active event code and is
    // never accepted from the browser.
    const activeEvent = await deps.resolveActiveEvent();
    if (!activeEvent.ok) {
      return checkinConfigError();
    }

    const raw = await deps.applyCheckin({
      actorUserId: session.userId,
      eventId: activeEvent.event.id,
      validationAttemptId: input.validationAttemptId,
      requestId: input.requestId,
      graduateArriving: input.graduateArriving,
      adultGuestsArriving: input.adultGuestsArriving,
      children0To4Arriving: input.children0To4Arriving,
      children5To10Arriving: input.children5To10Arriving,
    });
    return mapCheckinResult(raw);
  } catch {
    // Database errors can echo row values and are never surfaced.
    return checkinInternalError();
  }
}
