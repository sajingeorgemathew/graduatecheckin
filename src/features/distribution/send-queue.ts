/**
 * Send-queue CSV export for CHECKIN-09B.
 *
 * The send queue is loaded into a Google Sheet that the Apps Script sender
 * reads. It must open safely in Google Sheets, Excel and Numbers, so it
 * reuses the same two protections the CHECKIN-09A manifest uses:
 *
 *   1. RFC 4180 CSV quoting, so a comma, quote or newline inside a value can
 *      never break out of its field.
 *   2. Formula-injection neutralization, so a value beginning with =, +, -
 *      or @ is never evaluated as a spreadsheet formula.
 *
 * The queue deliberately excludes the raw QR token, any token hash, the
 * ticket-signing secret, the distribution-signing secret, Supabase keys,
 * storage URLs and internal staff user IDs. The row_signature it does carry
 * is not secret: it only proves the row was prepared by the app.
 */

import { csvRow } from "@/features/ticket-documents/manifest";

import type { PreparedDeliveryRow } from "./types";

/** Column order of the generated send-queue CSV. */
export const SEND_QUEUE_COLUMNS = [
  "delivery_batch_code",
  "delivery_reference",
  "row_signature",
  "event_code",
  "event_title",
  "delivery_mode",
  "delivery_purpose",
  "graduate_name",
  "intended_recipient_email",
  "ticket_code",
  "document_version",
  "pdf_file_name",
  "pdf_sha256",
  "graduate_count",
  "adult_guest_count",
  "adult_guest_names",
  "child_0_4_count",
  "child_5_10_count",
  "total_party_count",
  "document_generated_at",
  "delivery_prepared_at",
  "status",
  "attempt_count",
] as const;

/**
 * Joins adult guest names with a separator that survives a single CSV cell.
 * Never truncated: every registered adult guest name is included so the
 * distribution workflow can never silently drop a guest.
 */
export function joinAdultGuestNames(names: readonly string[]): string {
  return names.join("; ");
}

function queueValues(row: PreparedDeliveryRow): string[] {
  return [
    row.deliveryBatchCode,
    row.deliveryReference,
    row.rowSignature,
    row.eventCode,
    row.eventTitle,
    row.deliveryMode,
    row.deliveryPurpose,
    row.graduateName,
    row.intendedRecipientEmail,
    row.ticketCode,
    String(row.documentVersion),
    row.pdfFileName,
    row.pdfSha256,
    String(row.party.graduateCount),
    String(row.party.adultGuestCount),
    joinAdultGuestNames(row.party.adultGuestNames),
    String(row.party.children04Count),
    String(row.party.children510Count),
    String(row.party.totalPartyCount),
    row.documentGeneratedAt,
    row.deliveryPreparedAt,
    "prepared",
    "0",
  ];
}

/**
 * Builds the send-queue CSV with CRLF line endings, which every spreadsheet
 * reads correctly and which RFC 4180 specifies.
 */
export function buildSendQueueCsv(
  rows: readonly PreparedDeliveryRow[]
): string {
  const lines = [
    csvRow(SEND_QUEUE_COLUMNS),
    ...rows.map((row) => csvRow(queueValues(row))),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
