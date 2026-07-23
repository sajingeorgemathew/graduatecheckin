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
  | "email_missing"
  | "manually_sent"
  | "resent"
  | "needs_reconciliation";

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
  state: DeliveryState;
  sendCount: number;
  lastSentAt: string | null;
  lastSendKind: ManualDeliveryKindEnum | null;
  checkedIn: boolean;
  /** Source order IDs behind this registration, for search and audit. */
  sourceOrderIds: string[];
}

export interface ManualDeliverySummaryCounts {
  totalGraduates: number;
  readyToSend: number;
  ticketMissing: number;
  pdfMissing: number;
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
