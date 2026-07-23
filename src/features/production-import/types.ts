/**
 * Shared types for the direct production RSVP import. Safe for server and
 * client imports. Never place credentials or server handles here.
 */

import type {
  PaymentStatus,
  ProductionImportGroupDecisionEnum,
  ProductionImportOrderRoleEnum,
  ProductionImportStatusEnum,
  RegistrationStatus,
} from "@/types/database";
import type { ImportIssue, ParsedCell } from "@/features/imports/types";
import type { RsvpHeader } from "./constants";

export type { ImportIssue };

export interface RsvpHeaderMapping {
  /** Zero-based column index for each header the workbook actually has. */
  columns: Partial<Record<RsvpHeader, number>>;
  missingOptionalHeaders: RsvpHeader[];
  unexpectedHeaders: string[];
}

export interface RsvpWorksheetSelection {
  sheetName: string;
  headerRowIndex: number;
  dataRows: ParsedCell[][];
  mapping: RsvpHeaderMapping;
  notices: ImportIssue[];
}

/**
 * One normalized workbook row. Every uploaded row becomes exactly one of
 * these, including rows that will later be merged into another graduate:
 * the source order ID is never dropped.
 */
export interface SourceOrder {
  sourceRowNumber: number;
  sourceOrderId: string;
  graduateFullName: string;
  email: string | null;
  phone: string | null;
  gownSize: string | null;
  namePronunciation: string | null;
  guest1Name: string | null;
  guest2Name: string | null;
  kids04: number;
  kids510: number;
  /** True when the child cell held a value, rather than defaulting to zero.
   * Children aged 0-4 may be free, but only when explicitly selected. */
  kids04Explicit: boolean;
  kids510Explicit: boolean;
  feeTotal: number;
  taxTotal: number;
  orderTotal: number;
  note: string | null;
  sourceOrderStatus: string | null;
  sourceOrderDate: string | null;
  registrationStatus: RegistrationStatus;
  paymentStatus: PaymentStatus;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

/** A row that could not be normalized safely enough to reconcile. */
export interface RejectedRow {
  sourceRowNumber: number;
  sourceOrderId: string | null;
  errors: ImportIssue[];
}

export interface ParsedRows {
  orders: SourceOrder[];
  rejected: RejectedRow[];
}

/**
 * Why a reconciled graduate cannot be applied without an administrator
 * looking at it. Codes are stable; messages are built for display and never
 * contain a payment amount.
 */
export type ReviewReasonCode =
  | "same_email_different_name"
  | "unpaid_adult_guest"
  | "unpaid_child_5_10"
  | "unconfirmed_child_0_4"
  | "ambiguous_guest_cell"
  | "repeated_guest_name"
  | "conflicting_child_counts"
  | "guest_count_exceeds_maximum"
  | "conflicting_contact_details"
  | "missing_email"
  | "row_validation_warning";

export interface ReviewReason {
  code: ReviewReasonCode;
  message: string;
  /**
   * A blocking reason holds the graduate at needs_review until an
   * administrator decides. An advisory reason is surfaced in the preview
   * but never stops an otherwise clean row from being applied.
   */
  blocking: boolean;
}

/** The role one source order plays inside its reconciled graduate. */
export type OrderRole = ProductionImportOrderRoleEnum;

export interface ClassifiedOrder {
  order: SourceOrder;
  role: OrderRole;
}

/**
 * One reconciled graduate. Produces at most one production registration
 * and therefore at most one active ticket, whatever the number of source
 * orders behind it.
 */
export interface ReconciledGraduate {
  groupKey: string;
  canonicalFullName: string;
  email: string | null;
  phone: string | null;
  gownSize: string | null;
  namePronunciation: string | null;
  /** Guests supported by payment or a recorded approval. */
  approvedAdultGuests: number;
  approvedChildren04: number;
  approvedChildren510: number;
  approvedAdultGuestNames: string[];
  /** Guests present in the workbook but not yet entitled. */
  proposedAdultGuests: number;
  proposedChildren04: number;
  proposedChildren510: number;
  feeTotal: number;
  taxTotal: number;
  orderTotal: number;
  primarySourceOrderId: string;
  orders: ClassifiedOrder[];
  decision: ProductionImportGroupDecisionEnum;
  reviewReasons: ReviewReason[];
}

export interface ReconciliationResult {
  graduates: ReconciledGraduate[];
  rejected: RejectedRow[];
  notices: ImportIssue[];
}

export interface ProductionImportCounts {
  sourceOrderCount: number;
  graduateCount: number;
  duplicateSubmissionCount: number;
  supplementalOrderCount: number;
  needsReviewCount: number;
  excludedCount: number;
  expectedTicketCount: number;
}

export interface ProductionImportSummary extends ProductionImportCounts {
  importId: string;
  status: ProductionImportStatusEnum;
  originalFilename: string;
  worksheetName: string;
  createdAt: string;
  appliedAt: string | null;
  notices: ImportIssue[];
}

/** One source order as the reconciliation preview shows it. */
export interface PreviewSourceOrder {
  id: string;
  sourceRowNumber: number;
  sourceOrderId: string;
  orderRole: OrderRole;
  graduateFullName: string | null;
  email: string | null;
  guest1Name: string | null;
  guest2Name: string | null;
  kids04: number;
  kids510: number;
  feeTotal: number | null;
  taxTotal: number | null;
  orderTotal: number | null;
  note: string | null;
  sourceOrderDate: string | null;
  warnings: ImportIssue[];
  errors: ImportIssue[];
}

/** One reconciled graduate as the preview shows it. */
export interface PreviewGraduate {
  id: string;
  groupKey: string;
  canonicalFullName: string;
  email: string | null;
  phone: string | null;
  gownSize: string | null;
  namePronunciation: string | null;
  approvedAdultGuests: number;
  approvedChildren04: number;
  approvedChildren510: number;
  approvedAdultGuestNames: string[];
  approvedPartySize: number;
  feeTotal: number;
  taxTotal: number;
  orderTotal: number;
  decision: ProductionImportGroupDecisionEnum;
  reviewReasons: ReviewReason[];
  reconciliationNote: string | null;
  primarySourceOrderId: string;
  existingRegistrationId: string | null;
  orders: PreviewSourceOrder[];
}

export interface ProductionImportDetail {
  summary: ProductionImportSummary;
  graduates: PreviewGraduate[];
  rejected: PreviewSourceOrder[];
}

export interface ApplyProductionImportResult {
  createdRegistrations: number;
  updatedRegistrations: number;
  skippedGroups: number;
  linkedSourceOrders: number;
}

/** Structured error shape returned by production-import API routes. */
export interface StructuredError {
  error: {
    code: string;
    message: string;
  };
}
