/**
 * Shared types for the registration import feature. Safe for server and
 * client imports. Never place credentials or server handles here.
 */

import type {
  PaymentStatus,
  RegistrationImportRowResult,
  RegistrationImportStatus,
  RegistrationStatus,
} from "@/types/database";
import type { ExpectedHeader } from "./constants";

/** A single spreadsheet cell value after reading, before normalization. */
export type CellValue = string | number | boolean | Date | null;

export interface ParsedCell {
  value: CellValue;
  /** True when the source cell contained a formula. Formulas are never
   * evaluated and never stored; the row is flagged for review instead. */
  hasFormula: boolean;
}

export interface ParsedSheet {
  name: string;
  /** All populated rows including the header row, as parsed cells. */
  rows: ParsedCell[][];
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
}

/** A structured issue attached to a row or to the whole workbook. Issue
 * messages must never contain names, emails, phone numbers or payments. */
export interface ImportIssue {
  code: string;
  message: string;
}

export interface HeaderMapping {
  /** Zero-based column index for each expected header. */
  columns: Record<ExpectedHeader, number>;
  /** Trimmed unexpected header names, reported as informational notices. */
  unexpectedHeaders: string[];
}

export interface WorksheetSelection {
  sheet: ParsedSheet;
  mapping: HeaderMapping;
  /** Informational notices such as multiple matching worksheets. */
  notices: ImportIssue[];
}

export type ComparisonAction = "new" | "update" | "unchanged";

/**
 * The whitelisted normalized values extracted from one workbook row. Only
 * these values are ever stored. Unmapped cells and formulas are discarded.
 */
export interface NormalizedImportRow {
  source_row_number: number;
  source_registration_id: string;
  graduate_full_name: string;
  email: string | null;
  phone: string | null;
  gown_size: string | null;
  name_pronunciation: string | null;
  guest_1_name: string | null;
  guest_2_name: string | null;
  registered_adult_guests: number;
  registered_children_0_4: number;
  registered_children_5_10: number;
  expected_party_size: number;
  source_order_status: string | null;
  registration_status: RegistrationStatus;
  payment_status: PaymentStatus;
  fee_total: number;
  tax_total: number;
  order_total: number;
  source_order_date: string | null;
}

export interface ValidatedRow {
  source_row_number: number;
  /** Null when the row could not be normalized safely. */
  normalized: NormalizedImportRow | null;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

/** Existing registration fields the comparison is allowed to inspect. */
export interface ExistingRegistrationSummary {
  id: string;
  source_registration_id: string;
  graduate_full_name: string;
  email: string | null;
  phone: string | null;
  gown_size: string | null;
  name_pronunciation: string | null;
  registered_adult_guests: number;
  registered_children_0_4: number;
  registered_children_5_10: number;
  registration_status: RegistrationStatus;
  payment_status: PaymentStatus;
  fee_total: number | null;
  tax_total: number | null;
  order_total: number | null;
  source_order_date: string | null;
  /** Adult guest names ordered by sort order. */
  adult_guest_names: string[];
}

export interface RowComparison {
  action: ComparisonAction;
  existingRegistrationId: string | null;
  changedFields: string[];
}

export interface ImportRowCounts {
  total_rows: number;
  new_rows: number;
  updated_rows: number;
  unchanged_rows: number;
  warning_rows: number;
  error_rows: number;
  excluded_rows: number;
}

export interface ImportSummary extends ImportRowCounts {
  importId: string;
  status: RegistrationImportStatus;
  worksheetName: string;
  originalFilename: string;
  missing_existing_rows: number;
  notices: ImportIssue[];
}

export interface ApplyResult {
  applied_new: number;
  applied_updated: number;
  applied_unchanged: number;
  skipped: number;
}

/** Structured error shape returned by import API routes. Messages must
 * never contain secrets, stack traces or spreadsheet contents. */
export interface StructuredError {
  error: {
    code: string;
    message: string;
  };
}

export type PreviewFilter =
  | "all"
  | "new"
  | "update"
  | "unchanged"
  | "warning"
  | "error"
  | "failed"
  | "excluded";

/** Import row shape passed to the preview interface. */
export interface PreviewRow {
  id: string;
  source_row_number: number;
  source_registration_id: string | null;
  graduate_full_name: string | null;
  email: string | null;
  phone: string | null;
  gown_size: string | null;
  name_pronunciation: string | null;
  guest_1_name: string | null;
  guest_2_name: string | null;
  registered_adult_guests: number;
  registered_children_0_4: number;
  registered_children_5_10: number;
  expected_party_size: number;
  source_order_status: string | null;
  registration_status: RegistrationStatus;
  payment_status: PaymentStatus;
  fee_total: number | null;
  tax_total: number | null;
  order_total: number | null;
  source_order_date: string | null;
  result: RegistrationImportRowResult;
  comparison_action: ComparisonAction | null;
  validation_errors: ImportIssue[];
  validation_warnings: ImportIssue[];
  existing_registration_id: string | null;
}

export interface MissingExistingRegistration {
  id: string;
  source_registration_id: string;
  graduate_full_name: string;
}
