/**
 * Shared helpers for import tests. Workbooks are generated in memory with
 * fictional values only. Temporary files are never written by these
 * helpers.
 */

import * as XLSX from "xlsx";
import { EXPECTED_HEADERS } from "@/features/imports/constants";
import type { CellValue, ParsedCell } from "@/features/imports/types";

export type Aoa = Array<Array<string | number | null>>;

export function workbookBuffer(
  sheets: Array<{ name: string; aoa: Aoa }>
): Buffer {
  const book = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet(sheet.aoa),
      sheet.name
    );
  }
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export const HEADER_ROW: string[] = [...EXPECTED_HEADERS];

export interface FictionalRowInput {
  orderId?: string | number | null;
  orderDate?: string | number | null;
  status?: string | null;
  email?: string | null;
  fullName?: string | null;
  gownSize?: string | null;
  pronunciation?: string | null;
  phone?: string | number | null;
  guest1?: string | null;
  guest2?: string | null;
  kids0to4?: string | number | null;
  kids4to10?: string | number | null;
  feeTotal?: string | number | null;
  feeTaxTotal?: string | number | null;
  taxTotal?: string | number | null;
  orderTotal?: string | number | null;
}

/** Keeps an explicit null override while defaulting omitted values. */
function pick<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

/** Builds one workbook data row in expected header order. */
export function fictionalRow(
  input: FictionalRowInput = {}
): Array<string | number | null> {
  return [
    pick(input.orderId, "TEST-2001"),
    pick(input.orderDate, "2026-05-01"),
    pick(input.status, "processing"),
    pick(input.email, "fictional.person@example.com"),
    pick(input.fullName, "Fictional Test Person"),
    pick(input.gownSize, "M"),
    pick(input.pronunciation, null),
    pick(input.phone, "4165550999"),
    pick(input.guest1, null),
    pick(input.guest2, null),
    pick(input.kids0to4, null),
    pick(input.kids4to10, null),
    pick(input.feeTotal, 50),
    pick(input.feeTaxTotal, 6.5),
    pick(input.taxTotal, 6.5),
    pick(input.orderTotal, 56.5),
  ];
}

/** Wraps raw values as parsed cells without formulas. */
export function toParsedRow(values: CellValue[]): ParsedCell[] {
  return values.map((value) => ({ value, hasFormula: false }));
}
