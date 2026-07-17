/**
 * Generates a local-only fictional registration import workbook at
 * tmp/mock-registration-import.xlsx for developing and testing the Excel
 * import workflow.
 *
 * Every value is visibly fictional. No real graduate, guest, contact or
 * payment information may ever appear here and the _reference folder is
 * never read. The tmp folder is ignored by Git, so the generated workbook
 * is never committed.
 *
 * The output is deterministic. Uploading and applying it once, then
 * uploading it again unchanged, exercises the duplicate file protection.
 * To exercise update detection, apply the workbook once, edit one of the
 * update candidate rows in a spreadsheet editor and upload the changed
 * file.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

const OUTPUT_DIR = "tmp";
const OUTPUT_FILE = "mock-registration-import.xlsx";

/** The exact source headers plus one intentionally unexpected column. */
const HEADERS = [
  "order_id",
  "order_date",
  "status",
  "Email",
  "Full Name",
  "Graduation Gown Size",
  "Name Pronunciation",
  "Phone Number",
  "Guest 1",
  "Guest 2",
  "Kids (0 to 4)",
  "Kids (4 to 10)",
  "fee_total",
  "fee_tax_total",
  "tax_total",
  "order_total",
  "Unexpected Extra Column",
];

type Cell = string | number | null;

interface MockRow {
  orderId: string;
  orderDate: Cell;
  status: string;
  email: Cell;
  fullName: string;
  gownSize: Cell;
  pronunciation: Cell;
  phone: Cell;
  guest1: Cell;
  guest2: Cell;
  kids0to4: Cell;
  kids4to10: Cell;
  feeTotal: Cell;
  feeTaxTotal: Cell;
  taxTotal: Cell;
  orderTotal: Cell;
  note: string;
}

function graduate(index: number): string {
  return `Import Test Graduate ${String(index).padStart(3, "0")}`;
}

function email(index: number): string {
  return `import.grad${String(index).padStart(3, "0")}@example.com`;
}

function phone(index: number): string {
  return `41655503${String(index).padStart(2, "0")}`;
}

function standardRow(index: number, overrides: Partial<MockRow>): MockRow {
  return {
    orderId: `IMP-10${String(index).padStart(2, "0")}`,
    orderDate: `2026-05-${String((index % 28) + 1).padStart(2, "0")}`,
    status: "processing",
    email: email(index),
    fullName: graduate(index),
    gownSize: ["S", "M", "L", "XL"][index % 4],
    pronunciation: null,
    phone: phone(index),
    guest1: null,
    guest2: null,
    kids0to4: null,
    kids4to10: null,
    feeTotal: 50,
    feeTaxTotal: 6.5,
    taxTotal: 6.5,
    orderTotal: 56.5,
    note: "fictional standard row",
    ...overrides,
  };
}

const SHARED_EMAIL = "import.shared@example.com";

const rows: MockRow[] = [
  standardRow(1, {
    guest1: "Import Adult Guest 001-1",
    note: "valid new row, also an unchanged candidate on re-upload",
  }),
  standardRow(2, {
    guest1: "Import Adult Guest 002-1",
    guest2: "Import Adult Guest 002-2",
    note: "valid new row, edit this row to create an update candidate",
  }),
  standardRow(3, {
    kids0to4: "1 child",
    note: "one child aged 0 to 4 written as text",
  }),
  standardRow(4, { kids4to10: 1, note: "one child aged 5 to 10 as a number" }),
  standardRow(5, {
    kids0to4: 1,
    kids4to10: 1,
    note: "one child in each age group",
  }),
  standardRow(6, { status: "failed", note: "failed source status" }),
  standardRow(7, { email: null, note: "missing email warning" }),
  standardRow(8, { phone: "123", note: "invalid phone warning" }),
  standardRow(9, { email: SHARED_EMAIL, note: "duplicate email warning" }),
  standardRow(10, { email: SHARED_EMAIL, note: "duplicate email warning" }),
  standardRow(11, { note: "duplicate order ID error with the next row" }),
  standardRow(12, {
    orderId: "IMP-1011",
    note: "duplicate order ID error with the previous row",
  }),
  standardRow(13, {
    kids0to4: 2,
    kids4to10: 1,
    note: "too many combined children error",
  }),
  standardRow(14, {
    feeTaxTotal: 10,
    taxTotal: 9,
    note: "tax mismatch warning",
  }),
  standardRow(15, { status: "on-hold", note: "unknown source status warning" }),
  standardRow(16, {
    guest1: "Pat Example and Sam Example",
    note: "multiple names in one guest cell warning",
  }),
  standardRow(17, { gownSize: null, note: "missing gown size warning" }),
  standardRow(18, { orderDate: null, note: "missing order date warning" }),
  standardRow(19, {
    pronunciation: "IM-port TEST\ngrad-yoo-it",
    note: "pronunciation with a line break",
  }),
  standardRow(20, {
    feeTotal: "$75.00",
    feeTaxTotal: "$9.75",
    taxTotal: "$9.75",
    orderTotal: "$84.75",
    note: "money written as text",
  }),
  standardRow(21, { orderTotal: 0, feeTotal: 0, feeTaxTotal: 0, taxTotal: 0, note: "zero order total keeps payment unknown" }),
  standardRow(22, { guest1: "Import Adult Guest 022-1", note: "valid new row" }),
  standardRow(23, { kids4to10: "2 children", note: "two children aged 5 to 10 as text" }),
  standardRow(24, { note: "valid new row" }),
  standardRow(25, { note: "valid new row" }),
  standardRow(26, { note: "valid new row" }),
  standardRow(27, { guest2: "Import Adult Guest 027-2", note: "guest 2 without guest 1" }),
];

function toCells(row: MockRow): Cell[] {
  return [
    row.orderId,
    row.orderDate,
    row.status,
    row.email,
    row.fullName,
    row.gownSize,
    row.pronunciation,
    row.phone,
    row.guest1,
    row.guest2,
    row.kids0to4,
    row.kids4to10,
    row.feeTotal,
    row.feeTaxTotal,
    row.taxTotal,
    row.orderTotal,
    row.note,
  ];
}

function main(): void {
  const aoa: Cell[][] = [HEADERS, ...rows.map(toCells)];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Registrations");

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = join(OUTPUT_DIR, OUTPUT_FILE);
  XLSX.writeFile(book, outputPath);

  console.log(
    `Generated ${outputPath} with ${rows.length} fictional registration rows.`
  );
  console.log(
    "The tmp folder is ignored by Git. Never commit generated workbooks."
  );
}

main();
