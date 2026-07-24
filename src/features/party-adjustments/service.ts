import "server-only";

/**
 * Administrator party adjustment.
 *
 * Raises or lowers one graduate's registered party while preserving the exact
 * same active ticket and QR. The flow is deliberately ordered:
 *
 *   1. Authorize an administrator and resolve the active event server-side.
 *   2. Apply the party change atomically through the security-definer RPC,
 *      which locks the registration, audits the change and returns the
 *      unchanged ticket ID and code.
 *   3. Generate a new PDF version for the same ticket from the updated live
 *      party. The previous PDF is preserved in history and superseded.
 *
 * The ticket is never replaced and never regenerated: only a new PDF version
 * for the existing ticket is produced. If the PDF step fails the saved party
 * adjustment is never reversed; a partial success is returned so the desk can
 * mark the old PDF outdated, block sending and offer a safe retry.
 *
 * This module never imports or calls ticket replacement, and never writes
 * graduation_tickets, a scanner record or a check-in record.
 */

import { canAccessAdmin } from "@/features/auth/permissions";
import type { StaffSession } from "@/features/auth/types";
import {
  ACTIVE_EVENT_FAILURE_MESSAGES,
} from "@/features/events/active-event";
import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import { generateTicketDocument } from "@/features/ticket-documents/service";
import type { Json } from "@/types/database";

import * as repo from "./repository";
import { partyAdjustmentSchema } from "./schemas";
import type {
  AdjustmentPdfStatus,
  PartyAdjustmentResult,
  PartySnapshot,
  StructuredError,
} from "./types";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: StructuredError };

function failure<T>(
  status: number,
  code: string,
  message: string
): ServiceResult<T> {
  return { ok: false, status, error: { error: { code, message } } };
}

function accessFailure<T>(): ServiceResult<T> {
  return failure(
    403,
    "not_authorized",
    "Administrator access is required to adjust a party."
  );
}

/** Maps an RPC failure code to a privacy-safe HTTP response. */
function rpcFailure<T>(code: string): ServiceResult<T> {
  switch (code) {
    case "not_authorized":
      return accessFailure();
    case "invalid_reason":
      return failure(
        422,
        "invalid_reason",
        "An adjustment reason of at least 5 characters is required."
      );
    case "invalid_counts":
      return failure(
        422,
        "invalid_counts",
        "Every count must be a whole number of zero or more."
      );
    case "invalid_guest_names":
      return failure(
        422,
        "invalid_guest_names",
        "Adult guest names must be provided as text."
      );
    case "too_many_guest_names":
      return failure(
        422,
        "too_many_guest_names",
        "More guest names were supplied than adult guests."
      );
    case "registration_not_found":
      return failure(
        404,
        "registration_not_found",
        "The graduate was not found in the active event."
      );
    case "event_not_open":
    case "event_not_found":
      return failure(
        409,
        "event_not_open",
        "The graduation event is closed or archived."
      );
    case "stale_registration":
      return failure(
        409,
        "stale_registration",
        "This party was changed elsewhere since the editor opened. Reload " +
          "and try again."
      );
    default:
      return failure(
        500,
        "adjustment_failed",
        "The party could not be adjusted. Nothing was changed."
      );
  }
}

function numberField(value: Json | undefined, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function stringArrayField(value: Json | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

/** Maps a snake_case party snapshot from the RPC to the view shape. */
function parseSnapshot(value: Json | undefined): PartySnapshot {
  const record =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as { [key: string]: Json | undefined })
      : {};
  return {
    graduateName:
      typeof record.graduate_name === "string" ? record.graduate_name : "",
    graduateCount: numberField(record.graduate_count, 1),
    adultGuestNames: stringArrayField(record.adult_guest_names),
    adultGuestCount: numberField(record.adult_guest_count, 0),
    children04Count: numberField(record.child_0_4_count, 0),
    children510Count: numberField(record.child_5_10_count, 0),
    totalPartyCount: numberField(record.total_party_count, 1),
  };
}

interface ParsedRpc {
  ok: boolean;
  code: string | null;
  duplicate: boolean;
  noChange: boolean;
  adjustmentId: string | null;
  registrationId: string;
  ticketId: string | null;
  ticketCode: string | null;
  before: PartySnapshot;
  after: PartySnapshot;
}

function parseRpcResult(value: Json): ParsedRpc | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as { [key: string]: Json | undefined };
  return {
    ok: record.ok === true,
    code: typeof record.code === "string" ? record.code : null,
    duplicate: record.duplicate === true,
    noChange: record.no_change === true,
    adjustmentId:
      typeof record.adjustment_id === "string" ? record.adjustment_id : null,
    registrationId:
      typeof record.registration_id === "string"
        ? record.registration_id
        : "",
    ticketId: typeof record.ticket_id === "string" ? record.ticket_id : null,
    ticketCode:
      typeof record.ticket_code === "string" ? record.ticket_code : null,
    before: parseSnapshot(record.before_party),
    after: parseSnapshot(record.after_party),
  };
}

/**
 * Adjusts a graduate's registered party and regenerates the PDF for the same
 * ticket. Administrator only; the actor and the active event are resolved
 * server-side and never trusted from the request body.
 */
export async function adjustRegistrationParty(
  actor: StaffSession,
  body: unknown
): Promise<ServiceResult<PartyAdjustmentResult>> {
  if (!canAccessAdmin(actor.role)) {
    return accessFailure();
  }

  const parsed = partyAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return failure(
      422,
      "invalid_request",
      "Check the counts, the reason and the confirmation. Counts must be " +
        "whole numbers of zero or more and names cannot exceed the adult " +
        "guest count."
    );
  }
  const input = parsed.data;

  const resolution = await resolveActiveEvent();
  if (!resolution.ok) {
    return failure(
      409,
      resolution.code,
      ACTIVE_EVENT_FAILURE_MESSAGES[resolution.code]
    );
  }
  const event = resolution.event;

  // The registration must belong to the resolved active event. The event ID
  // is never taken from the browser.
  const registration = await repo.getRegistration(input.registrationId);
  if (registration === null || registration.event_id !== event.id) {
    return failure(
      404,
      "registration_not_found",
      "The graduate was not found in the active event."
    );
  }

  const rpcRaw = await repo.updateRegistrationPartyRpc({
    actorUserId: actor.userId,
    registrationId: input.registrationId,
    adultGuestCount: input.adultGuestCount,
    adultGuestNames: input.adultGuestNames,
    children04: input.children04,
    children510: input.children510,
    reason: input.reason,
    paymentNote: input.paymentNote ?? null,
    idempotencyKey: input.idempotencyKey,
    expectedUpdatedAt: input.expectedUpdatedAt ?? null,
  });

  const rpc = parseRpcResult(rpcRaw);
  if (rpc === null) {
    return failure(
      500,
      "adjustment_failed",
      "The party could not be adjusted. Nothing was changed."
    );
  }
  if (!rpc.ok) {
    return rpcFailure(rpc.code ?? "adjustment_failed");
  }

  // A no-change adjustment writes nothing and cues no PDF, so the current PDF
  // stays valid and there is nothing to regenerate.
  let pdfStatus: AdjustmentPdfStatus = "not_applicable";
  let newDocumentVersion: number | null = null;
  let newPdfFileName: string | null = null;
  let pdfWarning: string | null = null;

  if (!rpc.noChange && rpc.ticketId !== null) {
    // Generate a new PDF version for the same ticket from the updated live
    // party. The existing finalize function supersedes the old current
    // document and preserves it in history.
    const generated = await generateTicketDocument(
      actor.userId,
      rpc.ticketId
    );
    if (generated.ok) {
      pdfStatus = "regenerated";
      const document = await repo.getCurrentDocumentForTicket(rpc.ticketId);
      newDocumentVersion =
        generated.documentVersion ?? document?.document_version ?? null;
      newPdfFileName = document?.file_name ?? null;
    } else {
      // The party adjustment is real and the QR is still valid. The old PDF is
      // now outdated: the desk must block sending and offer a retry.
      pdfStatus = "generation_failed";
      pdfWarning =
        "The party was updated and the same QR remains valid, but the " +
        "updated PDF could not be generated. The previous PDF is now " +
        "outdated and cannot be sent until a new one is generated. Use " +
        "Generate updated PDF to retry.";
    }
  }

  return {
    ok: true,
    data: {
      noChange: rpc.noChange,
      duplicate: rpc.duplicate,
      adjustmentId: rpc.adjustmentId,
      registrationId: rpc.registrationId,
      ticketId: rpc.ticketId,
      ticketCode: rpc.ticketCode,
      before: rpc.before,
      after: rpc.after,
      pdfStatus,
      newDocumentVersion,
      newPdfFileName,
      pdfWarning,
    },
  };
}
