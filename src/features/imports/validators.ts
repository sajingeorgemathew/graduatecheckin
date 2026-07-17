/**
 * Row and workbook validation built on the normalizers.
 *
 * Produces whitelisted normalized rows plus structured errors and
 * warnings. Rows with errors can never be applied. Duplicate order IDs in
 * the same workbook are errors. Duplicate emails are warnings only,
 * because email is never a unique registration identifier.
 */

import {
  CHILD_GROUP_NORMALIZATION_NOTICE,
  MAX_COMBINED_CHILDREN,
} from "./constants";
import type { ExpectedHeader } from "./constants";
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
} from "./normalizers";
import type {
  HeaderMapping,
  ImportIssue,
  NormalizedImportRow,
  ParsedCell,
  ValidatedRow,
} from "./types";

function cellAt(
  row: ParsedCell[],
  mapping: HeaderMapping,
  header: ExpectedHeader
): ParsedCell {
  const index = mapping.columns[header];
  return row[index] ?? { value: null, hasFormula: false };
}

/**
 * Validates and normalizes one data row. The source row number is the
 * spreadsheet row number of the data row, counted from the header row.
 */
export function validateRow(
  row: ParsedCell[],
  mapping: HeaderMapping,
  sourceRowNumber: number
): ValidatedRow {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  const mappedHeaders = Object.keys(mapping.columns) as ExpectedHeader[];
  const hasFormula = mappedHeaders.some(
    (header) => cellAt(row, mapping, header).hasFormula
  );
  if (hasFormula) {
    warnings.push({
      code: "formula_in_row",
      message:
        "A mapped cell contains a spreadsheet formula. Formulas are never " +
        "evaluated. Review this row before applying.",
    });
  }

  const collect = <T>(result: {
    value: T;
    errors: ImportIssue[];
    warnings: ImportIssue[];
  }): T => {
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    return result.value;
  };

  const orderId = collect(normalizeOrderId(cellAt(row, mapping, "order_id").value));
  const fullName = collect(
    normalizeFullName(cellAt(row, mapping, "Full Name").value)
  );
  const email = collect(normalizeEmail(cellAt(row, mapping, "Email").value));
  const phone = collect(
    normalizePhone(cellAt(row, mapping, "Phone Number").value)
  );
  const gownSize = collect(
    normalizeGownSize(cellAt(row, mapping, "Graduation Gown Size").value)
  );
  const pronunciation = collect(
    normalizePronunciation(cellAt(row, mapping, "Name Pronunciation").value)
  );
  const guest1 = collect(
    normalizeGuestName(cellAt(row, mapping, "Guest 1").value, "Guest 1")
  );
  const guest2 = collect(
    normalizeGuestName(cellAt(row, mapping, "Guest 2").value, "Guest 2")
  );
  const children0to4 = collect(
    normalizeChildCount(
      cellAt(row, mapping, "Kids (0 to 4)").value,
      "children aged 0 to 4"
    )
  );
  const children5to10 = collect(
    normalizeChildCount(
      cellAt(row, mapping, "Kids (4 to 10)").value,
      "children aged 5 to 10"
    )
  );
  const feeTotal = collect(
    normalizeMoney(cellAt(row, mapping, "fee_total").value, "fee total")
  );
  const feeTaxTotal = collect(
    normalizeMoney(cellAt(row, mapping, "fee_tax_total").value, "fee tax total")
  );
  const taxTotal = collect(
    normalizeMoney(cellAt(row, mapping, "tax_total").value, "tax total")
  );
  const orderTotal = collect(
    normalizeMoney(cellAt(row, mapping, "order_total").value, "order total")
  );
  const orderDate = collect(
    normalizeOrderDate(cellAt(row, mapping, "order_date").value)
  );

  if (
    children0to4 !== null &&
    children5to10 !== null &&
    children0to4 + children5to10 > MAX_COMBINED_CHILDREN
  ) {
    errors.push({
      code: "too_many_children",
      message:
        "The combined number of children across both age groups " +
        "exceeds two.",
    });
  }

  // fee_tax_total is a validation comparison only and is never stored.
  if (
    feeTaxTotal !== null &&
    taxTotal !== null &&
    feeTaxTotal > 0 &&
    taxTotal > 0 &&
    feeTaxTotal !== taxTotal
  ) {
    warnings.push({
      code: "tax_mismatch",
      message: "The fee tax total and tax total differ. Review the taxes.",
    });
  }

  const statusMapping = normalizeSourceStatus(
    cellAt(row, mapping, "status").value,
    orderTotal
  );
  warnings.push(...statusMapping.warnings);

  if (errors.length > 0 || orderId === null || fullName === null) {
    return { source_row_number: sourceRowNumber, normalized: null, errors, warnings };
  }

  const adultGuests = (guest1 !== null ? 1 : 0) + (guest2 !== null ? 1 : 0);
  const safeChildren0to4 = children0to4 ?? 0;
  const safeChildren5to10 = children5to10 ?? 0;

  const normalized: NormalizedImportRow = {
    source_row_number: sourceRowNumber,
    source_registration_id: orderId,
    graduate_full_name: fullName,
    email,
    phone,
    gown_size: gownSize,
    name_pronunciation: pronunciation,
    guest_1_name: guest1,
    guest_2_name: guest2,
    registered_adult_guests: adultGuests,
    registered_children_0_4: safeChildren0to4,
    registered_children_5_10: safeChildren5to10,
    // The expected party size is always computed here. A source total is
    // never trusted.
    expected_party_size:
      1 + adultGuests + safeChildren0to4 + safeChildren5to10,
    source_order_status: statusMapping.sourceOrderStatus || null,
    registration_status: statusMapping.registrationStatus,
    payment_status: statusMapping.paymentStatus,
    fee_total: feeTotal ?? 0,
    tax_total: taxTotal ?? 0,
    order_total: orderTotal ?? 0,
    source_order_date: orderDate,
  };

  return { source_row_number: sourceRowNumber, normalized, errors, warnings };
}

/**
 * Validates every data row of the selected worksheet and applies
 * workbook-level rules: duplicate order IDs are errors on every affected
 * row and duplicate emails are warnings only.
 */
export function validateWorkbookRows(
  dataRows: ParsedCell[][],
  mapping: HeaderMapping
): ValidatedRow[] {
  const validated = dataRows.map((row, index) =>
    // Row numbers are spreadsheet style: header row is 1, data starts at 2.
    validateRow(row, mapping, index + 2)
  );

  const orderIdCounts = new Map<string, number>();
  const emailCounts = new Map<string, number>();

  for (const row of validated) {
    if (row.normalized === null) {
      continue;
    }
    const orderId = row.normalized.source_registration_id;
    orderIdCounts.set(orderId, (orderIdCounts.get(orderId) ?? 0) + 1);
    const email = row.normalized.email;
    if (email !== null) {
      emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    }
  }

  return validated.map((row) => {
    if (row.normalized === null) {
      return row;
    }
    const errors = [...row.errors];
    const warnings = [...row.warnings];
    let normalized: NormalizedImportRow | null = row.normalized;

    if ((orderIdCounts.get(row.normalized.source_registration_id) ?? 0) > 1) {
      errors.push({
        code: "duplicate_order_id",
        message:
          "This order ID appears more than once in the workbook. " +
          "Order IDs must be unique.",
      });
      normalized = null;
    }

    if (
      row.normalized.email !== null &&
      (emailCounts.get(row.normalized.email) ?? 0) > 1
    ) {
      warnings.push({
        code: "duplicate_email",
        message:
          "This email address appears on more than one row. Email is " +
          "never used as a registration identifier.",
      });
    }

    return { ...row, normalized, errors, warnings };
  });
}

/** The informational notice explaining the child age group normalization. */
export function childGroupNotice(): ImportIssue {
  return {
    code: "child_group_normalized",
    message: CHILD_GROUP_NORMALIZATION_NOTICE,
  };
}
