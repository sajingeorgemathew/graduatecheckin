/**
 * Shared types for the CHECKIN-09B distribution feature. Presentation and
 * transport shapes only; no secret material is described here.
 */

import type {
  DeliveryAttemptOutcome,
  DeliveryBatchStatus,
  DeliveryMode,
  DeliveryPurpose,
  DeliveryStatus,
  ResultImportStatus,
  ResultOutcome,
} from "./constants";

/** Registered party summary used across send queue, email and manifests. */
export interface DeliveryParty {
  graduateName: string;
  graduateCount: number;
  adultGuestNames: string[];
  adultGuestCount: number;
  children04Count: number;
  children510Count: number;
  totalPartyCount: number;
}

/**
 * A fully prepared send-queue row, before it is written to the database and
 * exported as CSV. Every field here is administrator-only.
 */
export interface PreparedDeliveryRow {
  deliveryReference: string;
  rowSignature: string;
  registrationId: string;
  ticketId: string;
  documentId: string;
  eventCode: string;
  eventTitle: string;
  deliveryBatchCode: string;
  deliveryMode: DeliveryMode;
  deliveryPurpose: DeliveryPurpose;
  graduateName: string;
  intendedRecipientEmail: string;
  ticketCode: string;
  documentVersion: number;
  pdfFileName: string;
  pdfSha256: string;
  party: DeliveryParty;
  documentGeneratedAt: string;
  deliveryPreparedAt: string;
}

/** A registration excluded from a delivery batch, with the reason why. */
export interface ExcludedDelivery {
  registrationId: string;
  graduateName: string;
  reason: DeliveryExclusionReason;
}

export type DeliveryExclusionReason =
  | "missing_email"
  | "invalid_email"
  | "no_active_ticket"
  | "ticket_revoked"
  | "ticket_replaced"
  | "no_current_document"
  | "superseded_document"
  | "outdated_document"
  | "document_event_mismatch"
  | "registration_ineligible"
  | "registration_cancelled"
  | "already_in_delivery_batch"
  | "mode_event_mismatch";

/** Row parsed from an Apps Script results CSV, before validation. */
export interface RawResultRow {
  deliveryBatchCode: string;
  deliveryReference: string;
  rowSignature: string;
  attemptReference: string;
  attemptNumber: string;
  intendedRecipientEmail: string;
  actualRecipientEmail: string;
  deliveryMode: string;
  outcome: string;
  attemptedAt: string;
  sentBy: string;
  pdfFileName: string;
  pdfSha256: string;
  errorCode: string;
  errorMessage: string;
  bounceDetectedAt: string;
  exportedAt: string;
}

export type ResultRowDisposition =
  | "accepted"
  | "duplicate"
  | "warning"
  | "rejected";

export interface EvaluatedResultRow {
  rowNumber: number;
  disposition: ResultRowDisposition;
  outcome: ResultOutcome | null;
  deliveryReference: string;
  attemptReference: string;
  intendedRecipientEmail: string;
  actualRecipientEmail: string;
  mode: DeliveryMode | null;
  reasonCode: ResultRejectionReason | null;
  message: string;
}

export type ResultRejectionReason =
  | "unknown_delivery_reference"
  | "invalid_row_signature"
  | "mismatched_pdf_checksum"
  | "mismatched_intended_recipient"
  | "duplicate_attempt_reference"
  | "mismatched_batch"
  | "malformed_timestamp"
  | "unsupported_outcome"
  | "formula_injection"
  | "wrong_event"
  | "malformed_row"
  | "missing_actual_recipient";

export interface ResultImportSummary {
  totalRows: number;
  acceptedRows: number;
  duplicateRows: number;
  warningRows: number;
  rejectedRows: number;
}

export type {
  DeliveryAttemptOutcome,
  DeliveryBatchStatus,
  DeliveryMode,
  DeliveryPurpose,
  DeliveryStatus,
  ResultImportStatus,
  ResultOutcome,
};
