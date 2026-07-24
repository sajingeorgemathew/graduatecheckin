import "server-only";

/**
 * Generation, regeneration and stale detection for branded PDF tickets.
 *
 * Ordering matters, because Supabase Storage and Postgres do not share one
 * transaction. Every generation follows the same five steps:
 *
 *   1. Render the PDF in memory.
 *   2. Checksum the bytes.
 *   3. Upload to a unique private object path (never overwriting).
 *   4. Finalize the database record atomically.
 *   5. If finalization fails, remove the uploaded object (best effort).
 *
 * The raw QR token is built inside the renderer, used to draw the QR and
 * discarded. It is never returned, logged, persisted or snapshotted.
 *
 * Generation never touches attendance: no CHECKIN-07 or CHECKIN-08 record
 * is read for a decision or written here.
 */

import { randomUUID } from "node:crypto";

import { getServerEnv } from "@/lib/env/server";
import { validateTicketSecret } from "@/features/tickets/token";
import type { Json, TicketDocumentInvalidationReasonEnum } from "@/types/database";

import {
  TICKET_DOCUMENT_BUCKET,
  TICKET_DOCUMENT_TEMPLATE_VERSION,
  buildTicketDocumentFileName,
  buildTicketDocumentStoragePath,
} from "./constants";
import { buildSourceFingerprint, sha256Hex } from "./fingerprint";
import { buildRegisteredParty, partySnapshotMatchesParty } from "./party";
import {
  buildEventDetails,
  buildTicketSettings,
  eventSnapshot,
  fallbackTicketSettings,
  formatIssuedAt,
  partySnapshot,
} from "./presentation";
import { renderTicketPdf } from "./render";
import * as repo from "./repository";
import {
  removeTicketDocumentQuietly,
  uploadTicketDocument,
} from "./storage";
import type {
  RegisteredParty,
  TicketDocumentGenerationItemResult,
  TicketDocumentSettings,
  TicketEventDetails,
} from "./types";

/** Everything needed to render and fingerprint one ticket. */
export interface TicketDocumentContext {
  eventId: string;
  registrationId: string;
  ticketId: string;
  ticketCode: string;
  ticketStatus: string;
  party: RegisteredParty;
  event: TicketEventDetails;
  settings: TicketDocumentSettings;
  fingerprint: string;
}

/**
 * Assembles the render context for one ticket from the normalized records.
 * The same context produces both the fingerprint and the rendered page, so
 * the two can never disagree.
 */
export async function buildTicketDocumentContext(
  ticketId: string
): Promise<TicketDocumentContext | null> {
  const ticket = await repo.getTicket(ticketId);
  if (ticket === null) {
    return null;
  }
  const registration = await repo.getRegistration(ticket.registration_id);
  if (registration === null) {
    return null;
  }
  const event = await repo.getEvent(registration.event_id);
  if (event === null) {
    return null;
  }

  const settingsRow = await repo.getEventTicketSettings(event.id);
  const settings =
    settingsRow === null
      ? fallbackTicketSettings(event)
      : buildTicketSettings(settingsRow);

  const guests = await repo.listRegistrationGuests(registration.id);
  const party = buildRegisteredParty(
    {
      graduateFullName: registration.graduate_full_name,
      registeredAdultGuests: registration.registered_adult_guests,
      registeredChildren04: registration.registered_children_0_4,
      registeredChildren510: registration.registered_children_5_10,
    },
    guests
  );

  const eventDetails = buildEventDetails(event);

  return {
    eventId: event.id,
    registrationId: registration.id,
    ticketId: ticket.id,
    ticketCode: ticket.ticket_code,
    ticketStatus: ticket.status,
    party,
    event: eventDetails,
    settings,
    fingerprint: buildSourceFingerprint({
      ticketId: ticket.id,
      ticketStatus: ticket.status,
      ticketCode: ticket.ticket_code,
      party,
      event: eventDetails,
      settings: {
        displayTitle: settings.displayTitle,
        description: settings.description,
        programSchedule: settings.programSchedule,
        primaryLogoAsset: settings.primaryLogoAsset,
        secondaryAsset: settings.secondaryAsset,
        instructions: settings.instructions,
      },
      templateVersion: settings.templateVersion,
    }),
  };
}

export type StaleReason =
  | "registration_changed"
  | "event_changed"
  | "template_changed";

export interface StaleEvaluation {
  isOutdated: boolean;
  reason: StaleReason | null;
  message: string | null;
}

/**
 * Compares the live fingerprint against the stored one.
 *
 * The stored document is never overwritten. When it is stale the
 * administrator generates a new version, and the previous version is
 * superseded and preserved.
 */
export function evaluateStaleness(
  context: TicketDocumentContext,
  storedFingerprint: string | null,
  storedTemplateVersion: number | null,
  storedPartySnapshot: Json | null
): StaleEvaluation {
  if (storedFingerprint === null) {
    return { isOutdated: false, reason: null, message: null };
  }
  if (storedFingerprint === context.fingerprint) {
    return { isOutdated: false, reason: null, message: null };
  }
  if (
    storedTemplateVersion !== null &&
    storedTemplateVersion !== context.settings.templateVersion
  ) {
    return {
      isOutdated: true,
      reason: "template_changed",
      message: "Ticket template changed - new PDF required",
    };
  }
  // Distinguish a registration change from an event change so the message
  // tells the administrator what actually moved. The same snapshot comparison
  // powers the Manual Delivery Desk's stale-PDF detection.
  const partyChanged = !partySnapshotMatchesParty(
    storedPartySnapshot,
    context.party
  );

  return partyChanged
    ? {
        isOutdated: true,
        reason: "registration_changed",
        message: "Updated registration - new PDF required",
      }
    : {
        isOutdated: true,
        reason: "event_changed",
        message: "Event information changed - new PDF required",
      };
}

export type GenerateFailureCode =
  | "ticket_not_found"
  | "ticket_not_active"
  | "settings_not_configured"
  | "ticket_configuration_invalid"
  | "storage_upload_failed"
  | "finalization_failed";

/**
 * Generates one new current PDF document for an active ticket.
 *
 * Concurrency safety comes from the database: the finalize function locks
 * the ticket row, allocates the next version and inserts under a partial
 * unique index. Two simultaneous requests therefore produce versions n and
 * n+1, never two current documents.
 */
export async function generateTicketDocument(
  actorUserId: string,
  ticketId: string
): Promise<TicketDocumentGenerationItemResult> {
  const context = await buildTicketDocumentContext(ticketId);
  if (context === null) {
    return {
      ok: false,
      registrationId: "",
      ticketId,
      code: "ticket_not_found",
      message: "The ticket was not found.",
    };
  }

  const failure = (
    code: GenerateFailureCode,
    message: string
  ): TicketDocumentGenerationItemResult => ({
    ok: false,
    registrationId: context.registrationId,
    ticketId: context.ticketId,
    code,
    message,
  });

  if (context.ticketStatus !== "active") {
    return failure(
      "ticket_not_active",
      "Only an active ticket can receive a new PDF."
    );
  }
  if (context.settings.description.trim().length === 0) {
    return failure(
      "settings_not_configured",
      "Configure the event ticket settings before generating PDFs."
    );
  }

  const { TICKET_TOKEN_SECRET } = getServerEnv();
  if (!validateTicketSecret(TICKET_TOKEN_SECRET).valid) {
    return failure(
      "ticket_configuration_invalid",
      "The ticket signing configuration is missing or invalid."
    );
  }

  // The document id is chosen before upload so the object path is unique
  // and the database row can claim exactly that path.
  const documentId = randomUUID();
  const generatedAtIso = new Date().toISOString();

  // The printed version is provisional: the database allocates the real
  // one. They agree because a ticket's versions are allocated under a lock,
  // and a mismatch only ever means a concurrent generation won the race, in
  // which case this attempt is rejected by the unique index below.
  const previous = await repo.getCurrentDocumentForTicket(context.ticketId);
  const provisionalVersion =
    previous === null ? 1 : previous.document_version + 1;

  let bytes: Buffer;
  try {
    bytes = await renderTicketPdf({
      ticketId: context.ticketId,
      ticketCode: context.ticketCode,
      ticketSecret: TICKET_TOKEN_SECRET,
      settings: context.settings,
      event: context.event,
      party: context.party,
      documentVersion: provisionalVersion,
      issuedAtLabel: formatIssuedAt(generatedAtIso, context.event.timezone),
      watermark: null,
    });
  } catch {
    // Never echo the underlying error: it can carry rendering internals.
    return failure("finalization_failed", "The PDF could not be rendered.");
  }

  const checksum = sha256Hex(bytes);
  const storagePath = buildTicketDocumentStoragePath(
    context.eventId,
    context.ticketId,
    documentId
  );
  const fileName = buildTicketDocumentFileName(
    context.ticketCode,
    provisionalVersion
  );

  try {
    await uploadTicketDocument(storagePath, bytes);
  } catch {
    return failure("storage_upload_failed", "The PDF could not be stored.");
  }

  let result: Json;
  try {
    result = await repo.finalizeTicketDocumentRpc({
      actorUserId,
      ticketId: context.ticketId,
      documentId,
      templateVersion: context.settings.templateVersion,
      storageBucket: TICKET_DOCUMENT_BUCKET,
      storagePath,
      fileName,
      fileSizeBytes: bytes.length,
      sha256Checksum: checksum,
      sourceFingerprint: context.fingerprint,
      graduateNameSnapshot: context.party.graduateName,
      ticketCodeSnapshot: context.ticketCode,
      registeredPartySnapshot: partySnapshot(context.party),
      eventSnapshot: eventSnapshot(context.event, context.settings),
    });
  } catch {
    // Step 5: the database never took ownership of these bytes, so remove
    // the orphaned object. A cleanup failure is not surfaced because the
    // generation error is what the administrator needs to act on.
    await removeTicketDocumentQuietly(storagePath);
    return failure("finalization_failed", "The PDF record could not be saved.");
  }

  const parsed = parseFinalizeResult(result);
  if (!parsed.ok) {
    await removeTicketDocumentQuietly(storagePath);
    return failure(
      parsed.code === "not_authorized"
        ? "finalization_failed"
        : (parsed.code as GenerateFailureCode),
      parsed.code === "ticket_not_active"
        ? "Only an active ticket can receive a new PDF."
        : "The PDF record could not be saved."
    );
  }

  return {
    ok: true,
    registrationId: context.registrationId,
    ticketId: context.ticketId,
    documentId: parsed.documentId,
    documentVersion: parsed.documentVersion,
  };
}

type FinalizeParse =
  | { ok: true; documentId: string; documentVersion: number }
  | { ok: false; code: string };

function parseFinalizeResult(value: Json): FinalizeParse {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: "unexpected_result" };
  }
  const record = value as { [key: string]: Json | undefined };
  if (record.ok !== true) {
    return {
      ok: false,
      code: typeof record.code === "string" ? record.code : "unexpected_result",
    };
  }
  const documentId = record.document_id;
  const documentVersion = record.document_version;
  if (typeof documentId !== "string" || typeof documentVersion !== "number") {
    return { ok: false, code: "unexpected_result" };
  }
  return { ok: true, documentId, documentVersion };
}

/**
 * Generates a bounded chunk of documents, reporting every item
 * individually. One failed item never discards the documents that already
 * succeeded, so an interrupted run can simply be resumed.
 */
export async function generateTicketDocuments(
  actorUserId: string,
  ticketIds: readonly string[]
): Promise<TicketDocumentGenerationItemResult[]> {
  const results: TicketDocumentGenerationItemResult[] = [];
  // Sequential on purpose: PDF rendering is CPU bound and a burst of
  // parallel renders would starve the request handler.
  for (const ticketId of ticketIds) {
    results.push(await generateTicketDocument(actorUserId, ticketId));
  }
  return results;
}

/**
 * Invalidates the documents of a replaced or revoked ticket. The old
 * document is preserved as history and can still be previewed with a
 * watermark, but can never enter a new export batch.
 */
export async function invalidateDocumentsForTicket(
  actorUserId: string,
  ticketId: string,
  reason: Extract<
    TicketDocumentInvalidationReasonEnum,
    "replaced" | "revoked" | "invalid"
  >
): Promise<boolean> {
  try {
    const result = await repo.invalidateTicketDocumentsRpc(
      actorUserId,
      ticketId,
      reason
    );
    if (result === null || typeof result !== "object" || Array.isArray(result)) {
      return false;
    }
    return (result as { [key: string]: Json | undefined }).ok === true;
  } catch {
    return false;
  }
}

export { TICKET_DOCUMENT_TEMPLATE_VERSION };
