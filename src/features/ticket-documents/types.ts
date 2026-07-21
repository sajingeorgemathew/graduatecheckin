/**
 * View and service types for the branded PDF ticket-document feature.
 *
 * Nothing in this module ever carries a raw QR token, a token hash or a
 * signing secret. Recipient email appears only on batch-manifest shapes,
 * which are administrator-only and are consumed by the deferred
 * CHECKIN-09B distribution work.
 */

export type TicketDocumentStatus = "current" | "superseded" | "invalidated";

export type TicketDocumentInvalidationReason =
  | "superseded"
  | "replaced"
  | "revoked"
  | "invalid";

export type TicketDocumentBatchStatus =
  | "draft"
  | "generating"
  | "ready"
  | "partial"
  | "failed"
  | "exported"
  | "cancelled";

export type TicketDocumentBatchPurpose =
  | "initial"
  | "updated"
  | "replacement"
  | "resend_preparation";

export type TicketDocumentBatchItemStatus = "ready" | "excluded" | "failed";

/** One entry of the printed program schedule. */
export interface ProgramScheduleEntry {
  startTime: string;
  endTime: string;
  title: string;
}

/**
 * Normalized registered party for one registration. Counts come from the
 * registration row, which is the source of truth; names come from the
 * normalized registration_guests rows. A guest with no recorded name
 * contributes to the count but never renders an empty name line.
 */
export interface RegisteredParty {
  graduateName: string;
  graduateCount: 1;
  adultGuestNames: string[];
  adultGuestCount: number;
  children04Count: number;
  children510Count: number;
  totalPartyCount: number;
}

/** Event facts shown on the printed ticket. */
export interface TicketEventDetails {
  title: string;
  dateLabel: string;
  startLabel: string;
  endLabel: string;
  timezone: string;
  venueName: string;
  venueAddress: string;
}

/** Presentation settings for one event's printed ticket. */
export interface TicketDocumentSettings {
  displayTitle: string;
  description: string;
  programSchedule: ProgramScheduleEntry[];
  primaryLogoAsset: string;
  secondaryAsset: string | null;
  templateVersion: number;
  instructions: string | null;
}

/**
 * Everything the PDF renderer needs. Assembled server-side and passed to
 * the document component; the QR data URL is produced in memory from the
 * existing CHECKIN-05 token service and never persisted.
 */
export interface TicketDocumentRenderInput {
  heading: readonly string[];
  settings: TicketDocumentSettings;
  event: TicketEventDetails;
  party: RegisteredParty;
  ticketCode: string;
  documentVersion: number;
  issuedAtLabel: string;
  qrImage: string;
  logoImage: Buffer | string | null;
  secondaryImage: Buffer | string | null;
  watermark: TicketDocumentWatermark | null;
}

/** Historical previews are watermarked; a current document is not. */
export type TicketDocumentWatermark =
  | "SUPERSEDED"
  | "REPLACED"
  | "REVOKED"
  | "INVALID";

/** A stored document row as the administrator UI sees it. */
export interface TicketDocumentView {
  documentId: string;
  ticketId: string;
  registrationId: string;
  documentVersion: number;
  templateVersion: number;
  status: TicketDocumentStatus;
  fileName: string;
  fileSizeBytes: number;
  checksumShort: string;
  generatedAt: string;
  generatedByDisplayName: string | null;
  supersededAt: string | null;
  invalidatedAt: string | null;
  invalidationReason: TicketDocumentInvalidationReason | null;
  isOutdated: boolean;
}

/** Derived per-registration state on the documents administration page. */
export type TicketDocumentRowState =
  | "missing"
  | "current"
  | "outdated"
  | "superseded"
  | "invalidated"
  | "failed";

export interface TicketDocumentListRow {
  registrationId: string;
  ticketId: string | null;
  ticketCode: string | null;
  graduateName: string;
  partySize: number;
  isTest: boolean;
  hasRecipientEmail: boolean;
  state: TicketDocumentRowState;
  documentVersion: number | null;
  generatedAt: string | null;
  inExportBatch: boolean;
  readyForExport: boolean;
}

export interface TicketDocumentSummaryCounts {
  eligibleActiveTickets: number;
  missingPdf: number;
  currentPdf: number;
  outdatedPdf: number;
  supersededPdf: number;
  invalidatedPdf: number;
  generationFailed: number;
  readyForExport: number;
  alreadyInExportBatch: number;
  missingRecipientEmail: number;
  testRegistrations: number;
  productionRegistrations: number;
}

export type TicketDocumentListFilter =
  | "all"
  | "missing"
  | "current"
  | "outdated"
  | "invalidated"
  | "ready_for_export"
  | "missing_email"
  | "test"
  | "production";

/** Result of generating one PDF. Every item reports individually. */
export type TicketDocumentGenerationItemResult =
  | {
      ok: true;
      registrationId: string;
      ticketId: string;
      documentId: string;
      documentVersion: number;
    }
  | {
      ok: false;
      registrationId: string;
      ticketId: string | null;
      code: string;
      message: string;
    };

export interface TicketDocumentGenerationSummary {
  requestedCount: number;
  generatedCount: number;
  failedCount: number;
  results: TicketDocumentGenerationItemResult[];
}

/** One row of the export manifest. Administrator-only. */
export interface ExportManifestRow {
  batchCode: string;
  exportItemId: string;
  eventTitle: string;
  graduateName: string;
  recipientEmail: string;
  ticketCode: string;
  documentVersion: string;
  pdfFileName: string;
  pdfSha256: string;
  graduateCount: string;
  adultGuestCount: string;
  adultGuestNames: string;
  child04Count: string;
  child510Count: string;
  totalPartyCount: string;
  documentGeneratedAt: string;
  batchCreatedAt: string;
  exportPurpose: string;
  itemStatus: string;
}
