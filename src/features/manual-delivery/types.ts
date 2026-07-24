/**
 * View and service types for the Manual Delivery Desk. Safe for server and
 * client imports.
 *
 * Unlike most administrator views in this application, a delivery row does
 * carry the recipient email address: copying it into Gmail is the entire
 * point of the desk, and the page is administrator-only.
 */

import type { ManualDeliveryKindEnum } from "@/types/database";
import type { ManualDeliveryFilter } from "./constants";
import type { RenderedTicketEmail } from "./email-template";

export type { ManualDeliveryFilter, RenderedTicketEmail };

export type DeliveryState =
  | "ready_to_send"
  | "ticket_missing"
  | "pdf_missing"
  | "pdf_outdated"
  | "email_missing"
  | "manually_sent"
  | "resent"
  | "needs_reconciliation";

/**
 * Whether the graduate's current PDF matches the live registered party.
 *  - missing:  no current PDF exists.
 *  - current:  the current PDF matches the live party and is safe to send.
 *  - outdated: the registration changed after the current PDF was generated,
 *              so the PDF must not be sent until a new one is generated.
 */
export type PdfStatus = "missing" | "current" | "outdated";

/** One graduate as the desk lists them. */
export interface ManualDeliveryRow {
  registrationId: string;
  graduateName: string;
  email: string | null;
  phone: string | null;
  approvedPartySize: number;
  approvedAdultGuests: number;
  approvedChildren04: number;
  approvedChildren510: number;
  adultGuestNames: string[];
  ticketId: string | null;
  ticketCode: string | null;
  documentId: string | null;
  pdfFileName: string | null;
  documentVersion: number | null;
  /** Whether the current PDF matches the live party. */
  pdfStatus: PdfStatus;
  /**
   * True when the latest recorded send carries an older party than the live
   * registration, so the graduate should be resent the updated details.
   */
  partyUpdatedSinceLastSend: boolean;
  /**
   * True when the party has changed since the last send and the updated PDF
   * is already current, so a resend can proceed immediately.
   */
  resendRecommended: boolean;
  state: DeliveryState;
  sendCount: number;
  lastSentAt: string | null;
  lastSendKind: ManualDeliveryKindEnum | null;
  checkedIn: boolean;
  /**
   * The registration updated_at, used as the optimistic-concurrency baseline
   * when the administrator edits the party.
   */
  registrationUpdatedAt: string;
  /** Source order IDs behind this registration, for search and audit. */
  sourceOrderIds: string[];
}

export interface ManualDeliverySummaryCounts {
  totalGraduates: number;
  readyToSend: number;
  ticketMissing: number;
  pdfMissing: number;
  pdfOutdated: number;
  manuallySent: number;
  resent: number;
  emailMissing: number;
  needsReconciliation: number;
  checkedIn: number;
  notCheckedIn: number;
}

export interface ManualDeliveryDeskData {
  eventName: string;
  eventIsTest: boolean;
  summary: ManualDeliverySummaryCounts;
  rows: ManualDeliveryRow[];
  filter: ManualDeliveryFilter;
  search: string;
  /** Set when the environment cannot produce a production logo URL. */
  logoWarning: string | null;
}

/** One recorded manual send, newest first. */
export interface ManualSendAttemptView {
  attemptId: string;
  attemptNumber: number;
  sendKind: ManualDeliveryKindEnum;
  intendedRecipient: string;
  actualRecipient: string | null;
  ticketCode: string;
  pdfFileName: string | null;
  documentVersion: number | null;
  reason: string | null;
  note: string | null;
  gmailMessageId: string | null;
  sentAt: string;
  recordedByDisplayName: string | null;
}

/** Everything the operator panel needs for one graduate. */
export interface ManualDeliveryDetail {
  row: ManualDeliveryRow;
  email: RenderedTicketEmail;
  gmailComposeUrl: string;
  attempts: ManualSendAttemptView[];
  /** Registration ID of the next unsent graduate, for Mark sent and next. */
  nextUnsentRegistrationId: string | null;
}

export interface StructuredError {
  error: {
    code: string;
    message: string;
  };
}
