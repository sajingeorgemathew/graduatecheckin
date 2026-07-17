/**
 * Preview comparison logic.
 *
 * Rows are matched against existing registrations using only the event,
 * the source system and the source registration ID. Names and emails are
 * never identity keys. Registrations missing from an upload are only
 * reported; they are never deleted, cancelled or changed.
 */

import type { RegistrationImportRowResult } from "@/types/database";
import type {
  ComparisonAction,
  ExistingRegistrationSummary,
  ImportIssue,
  MissingExistingRegistration,
  NormalizedImportRow,
  RowComparison,
} from "./types";

function moneyEquals(a: number | null, b: number | null): boolean {
  const left = a ?? 0;
  const right = b ?? 0;
  return Math.abs(left - right) < 0.005;
}

function textEquals(a: string | null, b: string | null): boolean {
  return (a ?? "") === (b ?? "");
}

function dateEquals(a: string | null, b: string | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return a === b;
  }
  return left === right;
}

/** Compares one normalized row with its matching registration and lists
 * the approved fields that differ. */
export function compareRow(
  row: NormalizedImportRow,
  existing: ExistingRegistrationSummary | undefined
): RowComparison {
  if (existing === undefined) {
    return { action: "new", existingRegistrationId: null, changedFields: [] };
  }

  const changedFields: string[] = [];

  if (!textEquals(row.graduate_full_name, existing.graduate_full_name)) {
    changedFields.push("graduate_full_name");
  }
  if (!textEquals(row.email, existing.email)) {
    changedFields.push("email");
  }
  if (!textEquals(row.phone, existing.phone)) {
    changedFields.push("phone");
  }
  if (!textEquals(row.gown_size, existing.gown_size)) {
    changedFields.push("gown_size");
  }
  if (!textEquals(row.name_pronunciation, existing.name_pronunciation)) {
    changedFields.push("name_pronunciation");
  }
  if (row.registered_adult_guests !== existing.registered_adult_guests) {
    changedFields.push("registered_adult_guests");
  }
  if (row.registered_children_0_4 !== existing.registered_children_0_4) {
    changedFields.push("registered_children_0_4");
  }
  if (row.registered_children_5_10 !== existing.registered_children_5_10) {
    changedFields.push("registered_children_5_10");
  }
  if (row.registration_status !== existing.registration_status) {
    changedFields.push("registration_status");
  }
  if (row.payment_status !== existing.payment_status) {
    changedFields.push("payment_status");
  }
  if (!moneyEquals(row.fee_total, existing.fee_total)) {
    changedFields.push("fee_total");
  }
  if (!moneyEquals(row.tax_total, existing.tax_total)) {
    changedFields.push("tax_total");
  }
  if (!moneyEquals(row.order_total, existing.order_total)) {
    changedFields.push("order_total");
  }
  if (!dateEquals(row.source_order_date, existing.source_order_date)) {
    changedFields.push("source_order_date");
  }

  const importedGuestNames = [row.guest_1_name, row.guest_2_name].filter(
    (name): name is string => name !== null
  );
  const existingGuestNames = existing.adult_guest_names;
  const guestNamesEqual =
    importedGuestNames.length === existingGuestNames.length &&
    importedGuestNames.every((name, index) => name === existingGuestNames[index]);
  if (!guestNamesEqual) {
    changedFields.push("adult_guest_names");
  }

  return {
    action: changedFields.length > 0 ? "update" : "unchanged",
    existingRegistrationId: existing.id,
    changedFields,
  };
}

/**
 * Final stored result for a row. Errors always win, then warnings, then
 * the comparison action. The comparison action is preserved separately in
 * the normalized snapshot so warning rows keep their underlying action.
 */
export function finalRowResult(
  errors: ImportIssue[],
  warnings: ImportIssue[],
  action: ComparisonAction | null
): RegistrationImportRowResult {
  if (errors.length > 0 || action === null) {
    return "error";
  }
  if (warnings.length > 0) {
    return "warning";
  }
  return action;
}

/**
 * Existing registrations for the same event and source system that are
 * absent from the uploaded workbook. They are labeled for review only.
 * No automatic action ever occurs for missing registrations.
 */
export function findMissingExisting(
  existing: ExistingRegistrationSummary[],
  uploadedOrderIds: ReadonlySet<string>
): MissingExistingRegistration[] {
  return existing
    .filter((reg) => !uploadedOrderIds.has(reg.source_registration_id))
    .map((reg) => ({
      id: reg.id,
      source_registration_id: reg.source_registration_id,
      graduate_full_name: reg.graduate_full_name,
    }));
}
