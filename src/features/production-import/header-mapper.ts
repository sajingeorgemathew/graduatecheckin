/**
 * Header matching and worksheet selection for the current RSVP workbook.
 *
 * Columns are always matched by header name and never by position. Matching
 * trims outer whitespace, collapses inner runs of whitespace and is
 * case-insensitive, so "Status", "status" and " Status " all resolve. A
 * small alias table accepts the older export's column names as well, so the
 * administrator never has to edit a workbook before uploading it.
 */

import type { ParsedCell, ParsedSheet, ParsedWorkbook } from "@/features/imports/types";
import { HEADER_ALIASES, REQUIRED_RSVP_HEADERS, RSVP_HEADERS } from "./constants";
import type { RsvpHeader } from "./constants";
import type { ImportIssue, RsvpHeaderMapping, RsvpWorksheetSelection } from "./types";

function headerText(cell: ParsedCell): string {
  if (cell.value === null) {
    return "";
  }
  return String(cell.value).replace(/\s+/g, " ").trim();
}

function lookupKey(text: string): string {
  return text.toLowerCase();
}

const CANONICAL_BY_KEY = new Map<string, RsvpHeader>([
  ...RSVP_HEADERS.map(
    (header) => [lookupKey(header), header] as [string, RsvpHeader]
  ),
  ...Object.entries(HEADER_ALIASES).map(
    ([alias, header]) => [lookupKey(alias), header] as [string, RsvpHeader]
  ),
]);

export type HeaderMappingResult =
  | { ok: true; mapping: RsvpHeaderMapping }
  | { ok: false; missingHeaders: RsvpHeader[] };

/**
 * Maps one header row. The first column matching a header wins, so a
 * duplicated column never silently overwrites the mapping.
 */
export function mapRsvpHeaders(headerRow: ParsedCell[]): HeaderMappingResult {
  const columns: Partial<Record<RsvpHeader, number>> = {};
  const unexpectedHeaders: string[] = [];

  headerRow.forEach((cell, index) => {
    const text = headerText(cell);
    if (text.length === 0) {
      return;
    }
    const canonical = CANONICAL_BY_KEY.get(lookupKey(text));
    if (canonical !== undefined && columns[canonical] === undefined) {
      columns[canonical] = index;
    } else {
      unexpectedHeaders.push(text);
    }
  });

  const missingHeaders = REQUIRED_RSVP_HEADERS.filter(
    (header) => columns[header] === undefined
  );
  if (missingHeaders.length > 0) {
    return { ok: false, missingHeaders: [...missingHeaders] };
  }

  const missingOptionalHeaders = RSVP_HEADERS.filter(
    (header) => columns[header] === undefined
  );

  return {
    ok: true,
    mapping: { columns, missingOptionalHeaders, unexpectedHeaders },
  };
}

export type WorksheetSelectionResult =
  | { ok: true; selection: RsvpWorksheetSelection }
  | { ok: false; issue: ImportIssue };

/**
 * Finds the header row inside a worksheet. Export tools sometimes place a
 * title or a blank row above the header, so the first ten populated rows
 * are each tried as a header row rather than assuming row one.
 */
function findHeaderRow(sheet: ParsedSheet): {
  index: number;
  mapping: RsvpHeaderMapping;
} | null {
  const limit = Math.min(sheet.rows.length, 10);
  for (let index = 0; index < limit; index++) {
    const result = mapRsvpHeaders(sheet.rows[index]);
    if (result.ok) {
      return { index, mapping: result.mapping };
    }
  }
  return null;
}

/**
 * Selects the first worksheet containing the RSVP headers. The selection
 * never depends on a worksheet name.
 */
export function selectRsvpWorksheet(
  workbook: ParsedWorkbook
): WorksheetSelectionResult {
  const matches: RsvpWorksheetSelection[] = [];

  for (const sheet of workbook.sheets) {
    const header = findHeaderRow(sheet);
    if (header === null) {
      continue;
    }
    matches.push({
      sheetName: sheet.name,
      headerRowIndex: header.index,
      dataRows: sheet.rows.slice(header.index + 1),
      mapping: header.mapping,
      notices: [],
    });
  }

  if (matches.length === 0) {
    return {
      ok: false,
      issue: {
        code: "missing_required_headers",
        message:
          "No worksheet contains the RSVP columns order_id, Status, " +
          "Full Name and Email. The workbook was rejected and nothing " +
          "was changed.",
      },
    };
  }

  const selected = matches[0];
  const notices: ImportIssue[] = [];

  if (matches.length > 1) {
    notices.push({
      code: "multiple_matching_worksheets",
      message:
        "Multiple worksheets contain the RSVP columns. The first matching " +
        "worksheet was used.",
    });
  }

  if (selected.mapping.missingOptionalHeaders.length > 0) {
    notices.push({
      code: "missing_optional_headers",
      message:
        "These optional columns were not present and are treated as blank: " +
        selected.mapping.missingOptionalHeaders.join(", ") +
        ".",
    });
  }

  if (selected.mapping.unexpectedHeaders.length > 0) {
    notices.push({
      code: "unexpected_headers",
      message:
        "Unrecognized columns were ignored: " +
        selected.mapping.unexpectedHeaders.join(", ") +
        ".",
    });
  }

  return { ok: true, selection: { ...selected, notices } };
}
