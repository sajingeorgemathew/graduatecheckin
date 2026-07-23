/**
 * Synthetic RSVP fixtures.
 *
 * The header row reproduces the real workbook contract exactly, so these
 * tests exercise the same column matching production uses. Every person,
 * address and phone number below is invented and uses the reserved
 * example.com domain and the reserved 555-01xx phone range. No real
 * graduate data appears in this repository or in any test.
 */

import type { ParsedCell, ParsedWorkbook } from "@/features/imports/types";
import { RSVP_HEADERS } from "@/features/production-import/constants";
import { selectRsvpWorksheet } from "@/features/production-import/header-mapper";
import { reconcileWorkbook } from "@/features/production-import/reconciliation";
import { normalizeWorkbookRows } from "@/features/production-import/rows";
import type {
  ParsedRows,
  ReconciliationResult,
} from "@/features/production-import/types";

/** One RSVP row as a test would write it. Every field is optional. */
export interface RsvpRow {
  order_id?: string | number;
  order_date?: string;
  Status?: string;
  "Full Name"?: string;
  Email?: string;
  "Phone Number"?: string;
  "Graduation Gown Size"?: string;
  "Name Pronunciation"?: string;
  "Guest 1 - Full Name"?: string;
  "Guest 2 - Full Name"?: string;
  "Kids (0 to 4)"?: string | number;
  Kids?: string | number;
  fee_total?: number;
  fee_tax_total?: number;
  order_total?: number;
  Note?: string;
}

function cell(value: string | number | null): ParsedCell {
  return { value, hasFormula: false };
}

/** Builds a single-worksheet workbook carrying the exact RSVP headers. */
export function buildRsvpWorkbook(
  rows: readonly RsvpRow[],
  headers: readonly string[] = RSVP_HEADERS
): ParsedWorkbook {
  const headerRow = headers.map((header) => cell(header));
  const dataRows = rows.map((row) =>
    headers.map((header) => {
      const value = (row as Record<string, string | number | undefined>)[
        header
      ];
      return cell(value === undefined ? null : value);
    })
  );
  return {
    sheets: [{ name: "RSVP Orders", rows: [headerRow, ...dataRows] }],
  };
}

/** Runs the parse half of the pipeline over synthetic rows. */
export function parseRsvpRows(rows: readonly RsvpRow[]): ParsedRows {
  const workbook = buildRsvpWorkbook(rows);
  const selection = selectRsvpWorksheet(workbook);
  if (!selection.ok) {
    throw new Error(`The fixture workbook was rejected: ${selection.issue.code}`);
  }
  return normalizeWorkbookRows(
    selection.selection.dataRows,
    selection.selection.mapping,
    selection.selection.headerRowIndex
  );
}

/** Runs the whole parse-and-reconcile pipeline over synthetic rows. */
export function reconcileRsvpRows(
  rows: readonly RsvpRow[]
): ReconciliationResult {
  return reconcileWorkbook(parseRsvpRows(rows));
}

/**
 * A baseline paid RSVP row. Spread it and override only what a test cares
 * about, so each test reads as the one thing it is checking.
 */
export function paidRow(overrides: RsvpRow): RsvpRow {
  return {
    order_date: "2026-05-04T10:00:00.000Z",
    Status: "processing",
    "Graduation Gown Size": "Medium",
    fee_total: 40,
    fee_tax_total: 5.2,
    order_total: 45.2,
    ...overrides,
  };
}

/** A zero-dollar RSVP row with no guests: the graduate only. */
export function freeRow(overrides: RsvpRow): RsvpRow {
  return {
    order_date: "2026-05-04T10:00:00.000Z",
    Status: "processing",
    "Graduation Gown Size": "Medium",
    fee_total: 0,
    fee_tax_total: 0,
    order_total: 0,
    ...overrides,
  };
}
