/**
 * Summary counting, snapshot building and display masking helpers.
 * Pure functions shared by the service layer, routes and tests.
 */

import type { Json, RegistrationImportRowResult } from "@/types/database";
import type {
  ComparisonAction,
  ImportRowCounts,
  NormalizedImportRow,
} from "./types";

export interface CountableRow {
  result: RegistrationImportRowResult;
  comparison_action: ComparisonAction | null;
}

/**
 * Counts rows for the import summary. Warning rows keep their underlying
 * comparison action, so a warning row that is new counts toward both the
 * warning total and the new total.
 */
export function computeRowCounts(rows: CountableRow[]): ImportRowCounts {
  const counts: ImportRowCounts = {
    total_rows: rows.length,
    new_rows: 0,
    updated_rows: 0,
    unchanged_rows: 0,
    warning_rows: 0,
    error_rows: 0,
    excluded_rows: 0,
  };

  for (const row of rows) {
    if (row.result === "error") {
      counts.error_rows += 1;
      continue;
    }
    if (row.result === "excluded") {
      counts.excluded_rows += 1;
      continue;
    }
    if (row.result === "warning") {
      counts.warning_rows += 1;
    }
    switch (row.comparison_action) {
      case "new":
        counts.new_rows += 1;
        break;
      case "update":
        counts.updated_rows += 1;
        break;
      case "unchanged":
        counts.unchanged_rows += 1;
        break;
      case null:
        break;
    }
  }

  return counts;
}

/**
 * Builds the whitelisted normalized snapshot stored with each import row.
 * It contains only normalized import values plus the computed comparison
 * action. Raw cells and formulas are never included.
 */
export function buildNormalizedSnapshot(
  normalized: NormalizedImportRow,
  action: ComparisonAction
): Json {
  return {
    ...normalized,
    comparison_action: action,
  };
}

/** Reads the preserved comparison action back out of a stored snapshot. */
export function snapshotComparisonAction(
  snapshot: Json
): ComparisonAction | null {
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot)
  ) {
    return null;
  }
  const action = snapshot["comparison_action"];
  if (action === "new" || action === "update" || action === "unchanged") {
    return action;
  }
  return null;
}

/** Masks a phone number for list views, keeping the final four digits. */
export function maskPhone(phone: string | null): string {
  if (phone === null || phone.length === 0) {
    return "";
  }
  if (phone.length <= 4) {
    return "***";
  }
  return `*** *** ${phone.slice(-4)}`;
}
