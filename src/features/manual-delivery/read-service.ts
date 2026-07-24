import "server-only";

/**
 * Read services for the Manual Delivery Desk.
 *
 * Every function verifies the acting session itself rather than relying on
 * a layout or the Proxy. Administrator only: the desk exposes recipient
 * email addresses and phone numbers, which supervisors and scanners must
 * never see.
 *
 * Nothing here sends anything. Loading the desk renders a preview and
 * reports state; a graduate is only ever shown as sent because an
 * administrator recorded it.
 */

import { canAccessAdmin } from "@/features/auth/permissions";
import type { StaffSession } from "@/features/auth/types";
import {
  ACTIVE_EVENT_FAILURE_MESSAGES,
  type ActiveEventFailureCode,
} from "@/features/events/active-event";
import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import { resolvePrimaryLogoAssetName } from "@/features/ticket-documents/assets";
import {
  buildRegisteredParty,
  partySnapshotMatchesParty,
} from "@/features/ticket-documents/party";
import { buildEventDetails } from "@/features/ticket-documents/presentation";
import { getClientEnv } from "@/lib/env/client";
import type {
  GraduationManualTicketSendRow,
  GraduationRegistrationRow,
} from "@/types/database";

import type { ManualDeliveryFilter } from "./constants";
import {
  buildGmailComposeUrl,
  buildProductionAssetUrl,
  renderTicketEmail,
  type EmailPurpose,
} from "./email-template";
import * as repo from "./repository";
import {
  filterDeliveryRows,
  findNextUnsent,
  partyChangedSinceSendSnapshot,
  resolveDeliveryState,
  searchDeliveryRows,
  summarizeDeliveryRows,
} from "./summaries";
import type {
  ManualDeliveryDeskData,
  ManualDeliveryDetail,
  ManualDeliveryRow,
  ManualSendAttemptView,
} from "./types";

export type ReadResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

function failure<T>(
  status: number,
  code: string,
  message: string
): ReadResult<T> {
  return { ok: false, status, code, message };
}

function accessFailure<T>(): ReadResult<T> {
  return failure(
    403,
    "not_authorized",
    "Administrator access is required for the Manual Delivery Desk."
  );
}

function eventFailure<T>(code: ActiveEventFailureCode): ReadResult<T> {
  return failure(409, code, ACTIVE_EVENT_FAILURE_MESSAGES[code]);
}

/**
 * The absolute production URL of the academy logo, or null when the
 * environment only knows about localhost. A null URL never becomes a
 * broken image in a graduate's inbox: the email falls back to a wordmark
 * and the desk warns the administrator.
 */
export function resolveLogoUrl(): string | null {
  const baseUrl = getClientEnv().NEXT_PUBLIC_APP_URL;
  return buildProductionAssetUrl(baseUrl, resolvePrimaryLogoAssetName());
}

/**
 * True when a registration is not settled enough to send a ticket for. A
 * failed or cancelled order and a row still marked review_required all need
 * an administrator to finish reconciling before a graduate is emailed.
 */
function needsReconciliation(
  registration: GraduationRegistrationRow
): boolean {
  return registration.registration_status !== "eligible";
}

/** Builds every desk row for the event from the current database state. */
async function loadRows(eventId: string): Promise<ManualDeliveryRow[]> {
  const registrations = await repo.listEventRegistrations(eventId);
  const registrationIds = registrations.map((row) => row.id);

  const [tickets, documents, guests, checkedIn, sends, links] =
    await Promise.all([
      repo.listActiveTickets(eventId),
      repo.listCurrentDocuments(eventId),
      repo.listGuests(registrationIds),
      repo.listCheckedInRegistrations(registrationIds),
      repo.listManualSends(eventId),
      repo.listSourceOrderLinks(eventId),
    ]);

  const sendsByRegistration = new Map<
    string,
    GraduationManualTicketSendRow[]
  >();
  for (const send of sends) {
    const bucket = sendsByRegistration.get(send.registration_id) ?? [];
    bucket.push(send);
    sendsByRegistration.set(send.registration_id, bucket);
  }

  const ordersByRegistration = new Map<string, string[]>();
  for (const link of links) {
    const bucket = ordersByRegistration.get(link.registration_id) ?? [];
    bucket.push(link.source_order_id);
    ordersByRegistration.set(link.registration_id, bucket);
  }

  return registrations.map((registration) => {
    const ticket = tickets.get(registration.id) ?? null;
    const document =
      ticket === null ? null : (documents.get(ticket.id) ?? null);
    const registrationSends = sendsByRegistration.get(registration.id) ?? [];
    // Sends arrive newest first from the repository.
    const latest = registrationSends[0] ?? null;
    const party = buildRegisteredParty(
      {
        graduateFullName: registration.graduate_full_name,
        registeredAdultGuests: registration.registered_adult_guests,
        registeredChildren04: registration.registered_children_0_4,
        registeredChildren510: registration.registered_children_5_10,
      },
      (guests.get(registration.id) ?? []).map((guest) => ({
        guestCategory: guest.guest_category,
        guestName: guest.guest_name,
        sortOrder: guest.sort_order,
      }))
    );
    const email = (registration.email ?? "").trim();

    const sourceOrderIds =
      ordersByRegistration.get(registration.id) ??
      (registration.source_registration_id === null
        ? []
        : [registration.source_registration_id]);

    // Reuse the ticket-document snapshot comparison so the desk's stale-PDF
    // detection can never disagree with the generator's own staleness check.
    const pdfStatus =
      document === null
        ? "missing"
        : partySnapshotMatchesParty(document.registered_party_snapshot, party)
          ? "current"
          : "outdated";

    // The manual-send ledger stores a party snapshot; when the live party has
    // moved on from the latest send, the graduate should be resent.
    const partyUpdatedSinceLastSend =
      latest !== null &&
      partyChangedSinceSendSnapshot(latest.party_snapshot, {
        adultGuestCount: party.adultGuestCount,
        children04Count: party.children04Count,
        children510Count: party.children510Count,
        totalPartyCount: party.totalPartyCount,
      });

    return {
      registrationId: registration.id,
      graduateName: registration.graduate_full_name,
      email: email.length === 0 ? null : email,
      phone: registration.phone,
      approvedPartySize: party.totalPartyCount,
      approvedAdultGuests: party.adultGuestCount,
      approvedChildren04: party.children04Count,
      approvedChildren510: party.children510Count,
      adultGuestNames: party.adultGuestNames,
      ticketId: ticket?.id ?? null,
      ticketCode: ticket?.ticket_code ?? null,
      documentId: document?.id ?? null,
      pdfFileName: document?.file_name ?? null,
      documentVersion: document?.document_version ?? null,
      pdfStatus,
      partyUpdatedSinceLastSend,
      // A resend is only recommended once the updated PDF is current: an
      // outdated PDF must be regenerated first.
      resendRecommended: partyUpdatedSinceLastSend && pdfStatus === "current",
      state: resolveDeliveryState({
        hasTicket: ticket !== null,
        hasPdf: document !== null,
        pdfOutdated: pdfStatus === "outdated",
        hasEmail: email.length > 0,
        needsReconciliation: needsReconciliation(registration),
        sendCount: registrationSends.length,
      }),
      sendCount: registrationSends.length,
      lastSentAt: latest?.sent_at ?? null,
      lastSendKind: latest?.send_kind ?? null,
      checkedIn: checkedIn.has(registration.id),
      registrationUpdatedAt: registration.updated_at,
      sourceOrderIds,
    };
  });
}

/** Loads the whole desk: summary counts plus one filtered, searched list. */
export async function loadManualDeliveryDesk(
  actor: StaffSession | null,
  filter: ManualDeliveryFilter,
  search: string
): Promise<ReadResult<ManualDeliveryDeskData>> {
  if (actor === null || !canAccessAdmin(actor.role)) {
    return accessFailure();
  }

  const resolution = await resolveActiveEvent();
  if (!resolution.ok) {
    return eventFailure(resolution.code);
  }
  const event = resolution.event;

  const rows = await loadRows(event.id);
  const logoUrl = resolveLogoUrl();

  return {
    ok: true,
    data: {
      eventName: event.event_name,
      eventIsTest: event.is_test,
      summary: summarizeDeliveryRows(rows),
      rows: searchDeliveryRows(filterDeliveryRows(rows, filter), search),
      filter,
      search,
      logoWarning:
        logoUrl === null
          ? "NEXT_PUBLIC_APP_URL is not a production URL, so the academy " +
            "logo cannot be embedded in a pasted email. Emails will use " +
            "the text wordmark until it is set."
          : null,
    },
  };
}

function toAttemptView(
  row: GraduationManualTicketSendRow,
  names: Map<string, string>
): ManualSendAttemptView {
  return {
    attemptId: row.id,
    attemptNumber: row.attempt_number,
    sendKind: row.send_kind,
    intendedRecipient: row.intended_recipient_snapshot,
    actualRecipient: row.actual_recipient_snapshot,
    ticketCode: row.ticket_code_snapshot,
    pdfFileName: row.pdf_file_name_snapshot,
    documentVersion: row.document_version_snapshot,
    reason: row.reason,
    note: row.note,
    gmailMessageId: row.gmail_message_id,
    sentAt: row.sent_at,
    recordedByDisplayName:
      row.recorded_by === null ? null : (names.get(row.recorded_by) ?? null),
  };
}

/**
 * Loads one graduate's operator panel, including the personalized branded
 * email. The email is generated fresh from the current registration and
 * ticket every time, so an edited party or a replaced ticket is reflected
 * immediately.
 */
export async function loadManualDeliveryDetail(
  actor: StaffSession | null,
  registrationId: string
): Promise<ReadResult<ManualDeliveryDetail>> {
  if (actor === null || !canAccessAdmin(actor.role)) {
    return accessFailure();
  }

  const resolution = await resolveActiveEvent();
  if (!resolution.ok) {
    return eventFailure(resolution.code);
  }
  const event = resolution.event;

  const rows = await loadRows(event.id);
  const row = rows.find(
    (candidate) => candidate.registrationId === registrationId
  );
  if (row === undefined) {
    return failure(
      404,
      "registration_not_found",
      "The graduate was not found in the active event."
    );
  }

  const attemptRows = await repo.listManualSendsForRegistration(registrationId);
  const names = await repo.getStaffDisplayNames(
    attemptRows
      .map((attempt) => attempt.recorded_by)
      .filter((value): value is string => value !== null)
  );

  const purpose: EmailPurpose =
    row.sendCount === 0
      ? "initial"
      : row.lastSendKind === "replacement"
        ? "replacement"
        : "resend";

  const email = renderTicketEmail({
    purpose,
    party: {
      graduateName: row.graduateName,
      adultGuestNames: row.adultGuestNames,
      adultGuestCount: row.approvedAdultGuests,
      children04Count: row.approvedChildren04,
      children510Count: row.approvedChildren510,
      totalPartyCount: row.approvedPartySize,
    },
    event: buildEventDetails(event),
    ticketCode: row.ticketCode ?? "(ticket not generated)",
    pdfFileName: row.pdfFileName,
    logoUrl: resolveLogoUrl(),
  });

  return {
    ok: true,
    data: {
      row,
      email,
      gmailComposeUrl: buildGmailComposeUrl(row.email, email.subject),
      attempts: attemptRows.map((attempt) => toAttemptView(attempt, names)),
      nextUnsentRegistrationId: findNextUnsent(rows, registrationId),
    },
  };
}
