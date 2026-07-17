/**
 * XLSX workbook reading and file validation.
 *
 * Workbooks are parsed entirely in memory and the original file is never
 * retained. Macros are never executed and formulas are never evaluated;
 * a formula in a mapped cell only flags the row for review. Cached formula
 * text is never stored anywhere.
 */

import * as XLSX from "xlsx";
import {
  ALLOWED_FILE_EXTENSION,
  MAX_FILE_SIZE_BYTES,
} from "./constants";
import type {
  CellValue,
  ImportIssue,
  ParsedCell,
  ParsedSheet,
  ParsedWorkbook,
} from "./types";

export function validateImportFile(
  filename: string,
  sizeBytes: number
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const lower = filename.trim().toLowerCase();

  if (!lower.endsWith(ALLOWED_FILE_EXTENSION)) {
    issues.push({
      code: "invalid_extension",
      message: "Only .xlsx workbooks are accepted.",
    });
  }

  if (sizeBytes <= 0) {
    issues.push({
      code: "empty_file",
      message: "The uploaded file is empty.",
    });
  }

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    issues.push({
      code: "file_too_large",
      message: "The uploaded file exceeds the 10 MB limit.",
    });
  }

  return issues;
}

function cellToValue(cell: XLSX.CellObject): CellValue {
  if (cell.v === undefined || cell.v === null) {
    return null;
  }
  if (cell.t === "n") {
    return typeof cell.v === "number" ? cell.v : null;
  }
  if (cell.t === "b") {
    return typeof cell.v === "boolean" ? cell.v : null;
  }
  if (cell.t === "d") {
    return cell.v instanceof Date ? cell.v : null;
  }
  if (cell.t === "e") {
    // Spreadsheet error values are treated as unreadable cells.
    return null;
  }
  return String(cell.v);
}

function isEmptyRow(row: ParsedCell[]): boolean {
  return row.every(
    (cell) =>
      !cell.hasFormula &&
      (cell.value === null ||
        (typeof cell.value === "string" && cell.value.trim().length === 0))
  );
}

function parseSheet(name: string, sheet: XLSX.WorkSheet): ParsedSheet {
  const ref = sheet["!ref"];
  if (typeof ref !== "string" || ref.length === 0) {
    return { name, rows: [] };
  }

  const range = XLSX.utils.decode_range(ref);
  const rows: ParsedCell[][] = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: ParsedCell[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[address] as XLSX.CellObject | undefined;
      if (!cell) {
        row.push({ value: null, hasFormula: false });
        continue;
      }
      row.push({
        value: cellToValue(cell),
        hasFormula: typeof cell.f === "string" && cell.f.length > 0,
      });
    }
    rows.push(row);
  }

  // Ignore empty rows after the last populated row.
  while (rows.length > 0 && isEmptyRow(rows[rows.length - 1])) {
    rows.pop();
  }

  return { name, rows };
}

export type ParseWorkbookResult =
  | { ok: true; workbook: ParsedWorkbook }
  | { ok: false; issue: ImportIssue };

export function parseWorkbook(buffer: Buffer): ParseWorkbookResult {
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      // Reading never executes macros and never evaluates formulas.
    });
  } catch {
    return {
      ok: false,
      issue: {
        code: "unreadable_workbook",
        message:
          "The file could not be read as an XLSX workbook. " +
          "Password-protected or corrupted files are not supported.",
      },
    };
  }

  const sheetNames = book.SheetNames.filter(
    (sheetName) => book.Sheets[sheetName] !== undefined
  );

  if (sheetNames.length === 0) {
    return {
      ok: false,
      issue: {
        code: "no_worksheets",
        message: "The workbook contains no worksheets.",
      },
    };
  }

  const sheets = sheetNames.map((sheetName) =>
    parseSheet(sheetName, book.Sheets[sheetName])
  );

  return { ok: true, workbook: { sheets } };
}
