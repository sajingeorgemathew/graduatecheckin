import "server-only";

/**
 * Write services for the Manual Delivery Desk.
 *
 * This module never sends email. It records what an administrator has
 * already done in Gmail, and it issues replacement tickets when a ticket
 * has to be reissued.
 *
 * Three actions exist and are deliberately distinct:
 *
 *  - Mark manually sent: the first recorded send of a valid ticket.
 *  - Record resend: the same valid ticket sent again. Requires a reason,
 *    appends a new attempt and never invalidates the ticket.
 *  - Replace ticket: a new ticket and a new PDF version. Requires a
 *    reason, invalidates the previous QR code and leaves the previous
 *    ticket traceable.
 */

import { REPLACE_CONFIRMATION_TEXT } from "@/features/tickets/constants";
import { canAccessAdmin } from "@/features/auth/permissions";
import type { StaffSession } from "@/features/auth/types";
import {
  generateTicketDocument,
  invalidateDocumentsForTicket,
} from "@/features/ticket-documents/service";
import {
  getTicketReplacementDeps,
  replaceTicket as replaceTicketCore,
} from "@/features/tickets/replacement";
import type { Json, ManualDeliveryKindEnum } from "@/types/database";

import * as repo from "./repository";
import {
  markManuallySentSchema,
  recordResendSchema,
  replaceTicketSchema,
} from "./schemas";
import type { StructuredError } from "./types";

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
    "Administrator access is required for manual delivery."
  );
}

export interface RecordedSend {
  attemptId: string;
  attemptNumber: number;
  /** True when this key had already been recorded, so nothing was added. */
  duplicate: boolean;
}

function parseRecordedSend(json: Json): RecordedSend | null {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return null;
  }
  const value = json as { [key: string]: Json | undefined };
  if (typeof value.attempt_id !== "string") {
    return null;
  }
  return {
    attemptId: value.attempt_id,
    attemptNumber:
      typeof value.attempt_number === "number" ? value.attempt_number : 1,
    duplicate: value.duplicate === true,
  };
}

interface RecordSendOptions {
  registrationId: string;
  idempotencyKey: string;
  actualRecipient: string | null;
  reason: string | null;
  note: string | null;
  gmailMessageId: string | null;
  sendKind: ManualDeliveryKindEnum;
}

/**
 * Shared path for an initial send and a resend. Both require a live active
 * ticket, and neither is ever recorded for a graduate with no address to
 * send to.
 */
async function recordSend(
  actor: StaffSession,
  options: RecordSendOptions
): Promise<ServiceResult<RecordedSend>> {
  const registration = await repo.getRegistration(options.registrationId);
  if (registration === null) {
    return failure(
      404,
      "registration_not_found",
      "The graduate was not found."
    );
  }

  const intendedRecipient = (registration.email ?? "").trim();
  if (intendedRecipient.length === 0) {
    return failure(
      409,
      "recipient_missing",
      "This graduate has no email address, so a send cannot be recorded. " +
        "Add an address first, or check the graduate in at the ceremony " +
        "without an email."
    );
  }

  const ticket = await repo.getActiveTicketForRegistration(
    options.registrationId
  );
  if (ticket === null) {
    return failure(
      409,
      "ticket_missing",
      "This graduate has no active ticket. Generate the ticket first."
    );
  }

  const document = await repo.getCurrentDocumentForTicket(ticket.id);

  const result = parseRecordedSend(
    await repo.recordManualSendRpc({
      registrationId: options.registrationId,
      ticketId: ticket.id,
      documentId: document?.id ?? null,
      sendKind: options.sendKind,
      idempotencyKey: options.idempotencyKey,
      intendedRecipient,
      actualRecipient: options.actualRecipient,
      reason: options.reason,
      note: options.note,
      gmailMessageId: options.gmailMessageId,
      recordedBy: actor.userId,
    })
  );

  if (result === null) {
    return failure(
      500,
      "record_failed",
      "The manual send could not be recorded. Nothing was changed."
    );
  }
  return { ok: true, data: result };
}

/**
 * Records the first manual send. Until this is called the application
 * never claims a graduate's ticket was emailed.
 */
export async function markManuallySent(
  actor: StaffSession,
  body: unknown
): Promise<ServiceResult<RecordedSend>> {
  if (!canAccessAdmin(actor.role)) {
    return accessFailure();
  }
  const parsed = markManuallySentSchema.safeParse(body);
  if (!parsed.success) {
    return failure(
      422,
      "invalid_request",
      "A graduate and an idempotency key are required."
    );
  }
  return recordSend(actor, {
    registrationId: parsed.data.registrationId,
    idempotencyKey: parsed.data.idempotencyKey,
    actualRecipient: parsed.data.actualRecipient ?? null,
    reason: null,
    note: parsed.data.note ?? null,
    gmailMessageId: parsed.data.gmailMessageId ?? null,
    sendKind: "initial",
  });
}

/**
 * Records a resend of the same valid ticket. The ticket keeps its code,
 * its QR token and its first-sent timestamp; only a new attempt is added.
 */
export async function recordResend(
  actor: StaffSession,
  body: unknown
): Promise<ServiceResult<RecordedSend>> {
  if (!canAccessAdmin(actor.role)) {
    return accessFailure();
  }
  const parsed = recordResendSchema.safeParse(body);
  if (!parsed.success) {
    return failure(
      422,
      "reason_required",
      "A resend requires a reason of at least 5 characters."
    );
  }
  return recordSend(actor, {
    registrationId: parsed.data.registrationId,
    idempotencyKey: parsed.data.idempotencyKey,
    actualRecipient: parsed.data.actualRecipient ?? null,
    reason: parsed.data.reason,
    note: parsed.data.note ?? null,
    gmailMessageId: parsed.data.gmailMessageId ?? null,
    sendKind: "resend",
  });
}

export interface ReplacementSummary {
  previousTicketId: string;
  newTicketId: string;
  newTicketCode: string;
  newDocumentGenerated: boolean;
}

/**
 * Replaces a graduate's ticket. The previous ticket stays in the record and
 * remains traceable, its QR token can never validate again, and its PDF is
 * invalidated so it can never be handed out as current. A fresh PDF is
 * generated immediately so the desk has something to attach.
 */
export async function replaceTicketForDelivery(
  actor: StaffSession,
  body: unknown
): Promise<ServiceResult<ReplacementSummary>> {
  if (!canAccessAdmin(actor.role)) {
    return accessFailure();
  }
  const parsed = replaceTicketSchema.safeParse(body);
  if (!parsed.success) {
    return failure(
      422,
      "reason_required",
      "A replacement requires a reason of at least 5 characters."
    );
  }

  const ticket = await repo.getActiveTicketForRegistration(
    parsed.data.registrationId
  );
  if (ticket === null) {
    return failure(
      409,
      "ticket_missing",
      "This graduate has no active ticket to replace."
    );
  }

  const replacement = await replaceTicketCore(
    getTicketReplacementDeps(),
    actor,
    ticket.id,
    {
      reason: parsed.data.reason,
      confirmationText: REPLACE_CONFIRMATION_TEXT,
    }
  );
  if (!replacement.ok) {
    return failure(
      replacement.status,
      replacement.error.error.code,
      replacement.error.error.message
    );
  }

  // The superseded PDF must never circulate as current alongside a QR code
  // that no longer validates.
  await invalidateDocumentsForTicket(actor.userId, ticket.id, "replaced");

  const generated = await generateTicketDocument(
    actor.userId,
    replacement.data.newTicketId
  );

  return {
    ok: true,
    data: {
      previousTicketId: replacement.data.previousTicketId,
      newTicketId: replacement.data.newTicketId,
      newTicketCode: replacement.data.newTicketCode,
      newDocumentGenerated: generated.ok,
    },
  };
}
