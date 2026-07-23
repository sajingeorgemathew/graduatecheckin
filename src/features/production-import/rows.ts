/**
 * Turns mapped workbook cells into normalized source orders.
 *
 * Every uploaded row becomes exactly one source order, including rows that
 * reconciliation will later merge into another graduate. A row is rejected
 * only when it carries no usable order ID or graduate name; the source
 * order ID is otherwise always preserved.
 *
 * The single-cell normalizers are reused unchanged from the CHECKIN-03
 * importer, so both pipelines agree on what an email, a phone number, a
 * money amount and a child count mean.
 */

import {
  normalizeChildCount,
  normalizeEmail,
  normalizeFullName,
  normalizeGownSize,
  normalizeGuestName,
  normalizeMoney,
  normalizeOrderDate,
  normalizeOrderId,
  normalizePhone,
  normalizePronunciation,
  normalizeSourceStatus,
} from "@/features/imports/normalizers";
import type { CellValue, ParsedCell } from "@/features/imports/types";
import type { RsvpHeader } from "./constants";
import type {
  ImportIssue,
  ParsedRows,
  RsvpHeaderMapping,
  SourceOrder,
} from "./types";

function cellAt(
  row: ParsedCell[],
  mapping: RsvpHeaderMapping,
  header: RsvpHeader
): ParsedCell | null {
  const index = mapping.columns[header];
  if (index === undefined) {
    return null;
  }
  return row[index] ?? null;
}

function valueAt(
  row: ParsedCell[],
  mapping: RsvpHeaderMapping,
  header: RsvpHeader
): CellValue {
  return cellAt(row, mapping, header)?.value ?? null;
}

function hasFormula(
  row: ParsedCell[],
  mapping: RsvpHeaderMapping,
  header: RsvpHeader
): boolean {
  return cellAt(row, mapping, header)?.hasFormula === true;
}

function isBlankRow(row: ParsedCell[]): boolean {
  return row.every(
    (cell) =>
      !cell.hasFormula &&
      (cell.value === null ||
        (typeof cell.value === "string" && cell.value.trim().length === 0))
  );
}

/** True when a mapped cell actually held a value the administrator typed. */
function isPopulated(cell: CellValue): boolean {
  if (cell === null) {
    return false;
  }
  if (typeof cell === "string") {
    return cell.trim().length > 0;
  }
  return true;
}

/** Free-text note: trimmed, line breaks collapsed, blank becomes null. */
export function normalizeNote(cell: CellValue): string | null {
  if (cell === null) {
    return null;
  }
  const text = String(cell).replace(/\s+/g, " ").trim();
  return text.length === 0 ? null : text;
}

const MAPPED_HEADERS: readonly RsvpHeader[] = [
  "order_id",
  "order_date",
  "Status",
  "Full Name",
  "Email",
  "Phone Number",
  "Graduation Gown Size",
  "Name Pronunciation",
  "Guest 1 - Full Name",
  "Guest 2 - Full Name",
  "Kids (0 to 4)",
  "Kids",
  "fee_total",
  "fee_tax_total",
  "order_total",
  "Note",
];

/**
 * Normalizes one workbook row. Formulas are never evaluated: a formula in
 * a mapped cell only adds a warning so the administrator reviews the row.
 */
export function normalizeSourceOrderRow(
  row: ParsedCell[],
  mapping: RsvpHeaderMapping,
  sourceRowNumber: number
): SourceOrder | { rejected: true; errors: ImportIssue[]; orderId: string | null } {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  const orderId = normalizeOrderId(valueAt(row, mapping, "order_id"));
  const fullName = normalizeFullName(valueAt(row, mapping, "Full Name"));
  errors.push(...orderId.errors, ...fullName.errors);

  if (orderId.value === null || fullName.value === null) {
    return { rejected: true, errors, orderId: orderId.value };
  }

  const formulaHeaders = MAPPED_HEADERS.filter((header) =>
    hasFormula(row, mapping, header)
  );
  if (formulaHeaders.length > 0) {
    warnings.push({
      code: "formula_in_mapped_cell",
      message:
        "One or more cells in this row contain a formula. Formulas are " +
        "never evaluated; confirm the recorded values.",
    });
  }

  const email = normalizeEmail(valueAt(row, mapping, "Email"));
  const phone = normalizePhone(valueAt(row, mapping, "Phone Number"));
  const gownSize = normalizeGownSize(
    valueAt(row, mapping, "Graduation Gown Size")
  );
  const pronunciation = normalizePronunciation(
    valueAt(row, mapping, "Name Pronunciation")
  );
  const guest1 = normalizeGuestName(
    valueAt(row, mapping, "Guest 1 - Full Name"),
    "Guest 1"
  );
  const guest2 = normalizeGuestName(
    valueAt(row, mapping, "Guest 2 - Full Name"),
    "Guest 2"
  );
  const kids04 = normalizeChildCount(
    valueAt(row, mapping, "Kids (0 to 4)"),
    "Kids (0 to 4)"
  );
  const kids510 = normalizeChildCount(valueAt(row, mapping, "Kids"), "Kids");
  const feeTotal = normalizeMoney(valueAt(row, mapping, "fee_total"), "fee total");
  const taxTotal = normalizeMoney(
    valueAt(row, mapping, "fee_tax_total"),
    "tax total"
  );
  const orderTotal = normalizeMoney(
    valueAt(row, mapping, "order_total"),
    "order total"
  );
  const orderDate = normalizeOrderDate(valueAt(row, mapping, "order_date"));
  const status = normalizeSourceStatus(
    valueAt(row, mapping, "Status"),
    orderTotal.value
  );

  for (const part of [
    email,
    phone,
    gownSize,
    pronunciation,
    guest1,
    guest2,
    kids04,
    kids510,
    feeTotal,
    taxTotal,
    orderTotal,
    orderDate,
  ]) {
    errors.push(...part.errors);
    warnings.push(...part.warnings);
  }
  warnings.push(...status.warnings);

  // An unreadable count or amount must not be guessed at. The row is kept
  // with a zero value and flagged, so the administrator decides.
  if (kids04.value === null || kids510.value === null) {
    errors.push({
      code: "unreadable_child_count",
      message:
        "A child count on this row could not be read as zero, one or two. " +
        "The row needs administrator review before it can be applied.",
    });
  }

  return {
    sourceRowNumber,
    sourceOrderId: orderId.value,
    graduateFullName: fullName.value,
    email: email.value,
    phone: phone.value,
    gownSize: gownSize.value,
    namePronunciation: pronunciation.value,
    guest1Name: guest1.value,
    guest2Name: guest2.value,
    kids04: kids04.value ?? 0,
    kids510: kids510.value ?? 0,
    kids04Explicit: isPopulated(valueAt(row, mapping, "Kids (0 to 4)")),
    kids510Explicit: isPopulated(valueAt(row, mapping, "Kids")),
    feeTotal: feeTotal.value ?? 0,
    taxTotal: taxTotal.value ?? 0,
    orderTotal: orderTotal.value ?? 0,
    note: normalizeNote(valueAt(row, mapping, "Note")),
    sourceOrderStatus: status.sourceOrderStatus,
    sourceOrderDate: orderDate.value,
    registrationStatus: status.registrationStatus,
    paymentStatus: status.paymentStatus,
    errors,
    warnings,
  };
}

/**
 * Normalizes every data row. Blank spacer rows are skipped silently; the
 * reported row number is the worksheet row the administrator would see.
 */
export function normalizeWorkbookRows(
  dataRows: readonly ParsedCell[][],
  mapping: RsvpHeaderMapping,
  headerRowIndex: number
): ParsedRows {
  const orders: SourceOrder[] = [];
  const rejected: ParsedRows["rejected"] = [];

  dataRows.forEach((row, offset) => {
    if (isBlankRow(row)) {
      return;
    }
    // Worksheet rows are one-based and the header occupies its own row.
    const sourceRowNumber = headerRowIndex + offset + 2;
    const result = normalizeSourceOrderRow(row, mapping, sourceRowNumber);
    if ("rejected" in result) {
      rejected.push({
        sourceRowNumber,
        sourceOrderId: result.orderId,
        errors: result.errors,
      });
      return;
    }
    orders.push(result);
  });

  return { orders, rejected };
}
