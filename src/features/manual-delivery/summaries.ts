/**
 * Derives the Manual Delivery Desk's rows, counts, filters and search.
 *
 * Pure functions over already-loaded records, so the whole page state is
 * unit testable without a database. Delivery state is computed here and
 * never stored, because the underlying ticket, PDF and send ledger are the
 * only sources of truth.
 */

import type { Json } from "@/types/database";
import type { ManualDeliveryFilter } from "./constants";
import type {
  DeliveryState,
  ManualDeliveryRow,
  ManualDeliverySummaryCounts,
} from "./types";

export interface DeliveryStateInput {
  hasTicket: boolean;
  hasPdf: boolean;
  /** The current PDF no longer matches the live party. */
  pdfOutdated: boolean;
  hasEmail: boolean;
  needsReconciliation: boolean;
  sendCount: number;
}

/**
 * Resolves one row's delivery state.
 *
 * A recorded send always wins, because it is a statement of fact made by a
 * human: a graduate who has been sent their ticket is never shown as
 * "ready to send" again just because a newer PDF was generated. Everything
 * else reports the first thing blocking a send. An outdated PDF is never
 * "ready to send": the registration changed after it was generated.
 */
export function resolveDeliveryState(
  input: DeliveryStateInput
): DeliveryState {
  if (input.sendCount > 1) {
    return "resent";
  }
  if (input.sendCount === 1) {
    return "manually_sent";
  }
  if (input.needsReconciliation) {
    return "needs_reconciliation";
  }
  if (!input.hasTicket) {
    return "ticket_missing";
  }
  if (!input.hasEmail) {
    return "email_missing";
  }
  if (!input.hasPdf) {
    return "pdf_missing";
  }
  if (input.pdfOutdated) {
    return "pdf_outdated";
  }
  return "ready_to_send";
}

/**
 * True when the live party differs from the party captured on a recorded
 * send. The manual-send ledger stores only party counts (not names), so this
 * compares exactly those fields. Name-only changes are surfaced by the PDF
 * staleness check instead, which does include names. A missing or malformed
 * snapshot reads as changed.
 */
export function partyChangedSinceSendSnapshot(
  snapshot: Json | null,
  live: {
    adultGuestCount: number;
    children04Count: number;
    children510Count: number;
    totalPartyCount: number;
  }
): boolean {
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot)
  ) {
    return true;
  }
  const record = snapshot as { [key: string]: Json | undefined };
  return (
    record.adult_guest_count !== live.adultGuestCount ||
    record.child_0_4_count !== live.children04Count ||
    record.child_5_10_count !== live.children510Count ||
    record.total_party_count !== live.totalPartyCount
  );
}

export function summarizeDeliveryRows(
  rows: readonly ManualDeliveryRow[]
): ManualDeliverySummaryCounts {
  const counts: ManualDeliverySummaryCounts = {
    totalGraduates: rows.length,
    readyToSend: 0,
    ticketMissing: 0,
    pdfMissing: 0,
    pdfOutdated: 0,
    manuallySent: 0,
    resent: 0,
    emailMissing: 0,
    needsReconciliation: 0,
    checkedIn: 0,
    notCheckedIn: 0,
  };

  for (const row of rows) {
    switch (row.state) {
      case "ready_to_send":
        counts.readyToSend += 1;
        break;
      case "ticket_missing":
        counts.ticketMissing += 1;
        break;
      case "pdf_missing":
        counts.pdfMissing += 1;
        break;
      case "pdf_outdated":
        counts.pdfOutdated += 1;
        break;
      case "manually_sent":
        counts.manuallySent += 1;
        break;
      case "resent":
        counts.resent += 1;
        break;
      case "email_missing":
        counts.emailMissing += 1;
        break;
      case "needs_reconciliation":
        counts.needsReconciliation += 1;
        break;
    }
    // Email presence is reported independently of the winning state, so a
    // graduate already sent a ticket still counts once under "email missing"
    // only when they genuinely have no address.
    if (row.email === null && row.state !== "email_missing") {
      counts.emailMissing += 1;
    }
    if (row.checkedIn) {
      counts.checkedIn += 1;
    } else {
      counts.notCheckedIn += 1;
    }
  }

  return counts;
}

export function filterDeliveryRows(
  rows: readonly ManualDeliveryRow[],
  filter: ManualDeliveryFilter
): ManualDeliveryRow[] {
  switch (filter) {
    case "ready_to_send":
      return rows.filter((row) => row.state === "ready_to_send");
    case "ticket_missing":
      return rows.filter((row) => row.state === "ticket_missing");
    case "manually_sent":
      return rows.filter((row) => row.sendCount === 1);
    case "resent":
      return rows.filter((row) => row.sendCount > 1);
    case "email_missing":
      return rows.filter((row) => row.email === null);
    case "needs_reconciliation":
      return rows.filter((row) => row.state === "needs_reconciliation");
    case "checked_in":
      return rows.filter((row) => row.checkedIn);
    case "not_checked_in":
      return rows.filter((row) => !row.checkedIn);
    case "all":
    default:
      return [...rows];
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Searches by graduate name, email, phone, source order ID or ticket code.
 * A phone search matches on digits alone, so "(416) 555-0100" and
 * "4165550100" both find the same graduate.
 */
export function searchDeliveryRows(
  rows: readonly ManualDeliveryRow[],
  search: string
): ManualDeliveryRow[] {
  const term = normalize(search);
  if (term.length === 0) {
    return [...rows];
  }
  const digits = digitsOnly(term);

  return rows.filter((row) => {
    if (normalize(row.graduateName).includes(term)) {
      return true;
    }
    if (row.email !== null && normalize(row.email).includes(term)) {
      return true;
    }
    if (
      digits.length >= 3 &&
      row.phone !== null &&
      digitsOnly(row.phone).includes(digits)
    ) {
      return true;
    }
    if (
      row.ticketCode !== null &&
      normalize(row.ticketCode).includes(term)
    ) {
      return true;
    }
    if (
      row.pdfFileName !== null &&
      normalize(row.pdfFileName).includes(term)
    ) {
      return true;
    }
    return row.sourceOrderIds.some((id) => normalize(id).includes(term));
  });
}

/**
 * The next graduate the administrator should work on after recording a
 * send: the first row after the current one that is ready to send. The list
 * wraps, so finishing at the bottom continues from the top.
 */
export function findNextUnsent(
  rows: readonly ManualDeliveryRow[],
  currentRegistrationId: string
): string | null {
  const index = rows.findIndex(
    (row) => row.registrationId === currentRegistrationId
  );
  const start = index < 0 ? 0 : index + 1;
  for (let offset = 0; offset < rows.length; offset++) {
    const row = rows[(start + offset) % rows.length];
    if (
      row.registrationId !== currentRegistrationId &&
      row.state === "ready_to_send"
    ) {
      return row.registrationId;
    }
  }
  return null;
}
