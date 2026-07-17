/**
 * Header matching and worksheet selection.
 *
 * Columns are always mapped by trimmed header name and never by position.
 * The first worksheet containing every required header is selected. If no
 * worksheet matches, the upload is rejected.
 */

import { EXPECTED_HEADERS, REQUIRED_HEADERS } from "./constants";
import type { ExpectedHeader } from "./constants";
import type {
  HeaderMapping,
  ImportIssue,
  ParsedCell,
  ParsedSheet,
  ParsedWorkbook,
  WorksheetSelection,
} from "./types";

function headerText(cell: ParsedCell): string {
  if (cell.value === null) {
    return "";
  }
  return String(cell.value).trim();
}

export type HeaderMappingResult =
  | { ok: true; mapping: HeaderMapping }
  | { ok: false; missingHeaders: string[] };

/**
 * Attempts to map a header row to the expected header set. Matching trims
 * outer whitespace on both sides, so "Guest 2 " matches "Guest 2" while the
 * expected names are preserved for administrative reporting.
 */
export function mapHeaders(headerRow: ParsedCell[]): HeaderMappingResult {
  const expectedByTrimmedName = new Map<string, ExpectedHeader>(
    EXPECTED_HEADERS.map((header) => [header.trim(), header])
  );

  const columns: Partial<Record<ExpectedHeader, number>> = {};
  const unexpectedHeaders: string[] = [];

  headerRow.forEach((cell, index) => {
    const text = headerText(cell);
    if (text.length === 0) {
      return;
    }
    const expected = expectedByTrimmedName.get(text);
    if (expected !== undefined && columns[expected] === undefined) {
      columns[expected] = index;
    } else {
      unexpectedHeaders.push(text);
    }
  });

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => columns[header] === undefined
  );

  if (missingHeaders.length > 0) {
    return { ok: false, missingHeaders: [...missingHeaders] };
  }

  return {
    ok: true,
    mapping: {
      columns: columns as Record<ExpectedHeader, number>,
      unexpectedHeaders,
    },
  };
}

export type WorksheetSelectionResult =
  | { ok: true; selection: WorksheetSelection }
  | { ok: false; issue: ImportIssue };

function firstPopulatedRowIndex(sheet: ParsedSheet): number {
  return sheet.rows.findIndex((row) =>
    row.some((cell) => headerText(cell).length > 0)
  );
}

/**
 * Searches every worksheet for the expected header set and selects the
 * first match. Multiple matching worksheets add an import warning. The
 * selection never depends on a specific worksheet name.
 */
export function selectWorksheet(
  workbook: ParsedWorkbook
): WorksheetSelectionResult {
  const matches: Array<{ sheet: ParsedSheet; mapping: HeaderMapping }> = [];

  for (const sheet of workbook.sheets) {
    const headerIndex = firstPopulatedRowIndex(sheet);
    if (headerIndex < 0) {
      continue;
    }
    const result = mapHeaders(sheet.rows[headerIndex]);
    if (result.ok) {
      matches.push({
        // Drop any leading empty rows so data rows follow the header row.
        sheet: { name: sheet.name, rows: sheet.rows.slice(headerIndex) },
        mapping: result.mapping,
      });
    }
  }

  if (matches.length === 0) {
    return {
      ok: false,
      issue: {
        code: "missing_required_headers",
        message:
          "No worksheet contains the required registration headers. " +
          "The workbook was rejected.",
      },
    };
  }

  const notices: ImportIssue[] = [];

  if (matches.length > 1) {
    notices.push({
      code: "multiple_matching_worksheets",
      message:
        "Multiple worksheets contain the required headers. " +
        "The first matching worksheet was used.",
    });
  }

  const selected = matches[0];

  if (selected.mapping.unexpectedHeaders.length > 0) {
    notices.push({
      code: "unexpected_headers",
      message:
        "Unexpected columns were ignored: " +
        selected.mapping.unexpectedHeaders.join(", ") +
        ".",
    });
  }

  return {
    ok: true,
    selection: {
      sheet: selected.sheet,
      mapping: selected.mapping,
      notices,
    },
  };
}
