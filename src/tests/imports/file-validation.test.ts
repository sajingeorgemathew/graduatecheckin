import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { MAX_FILE_SIZE_BYTES } from "@/features/imports/constants";
import { mapHeaders } from "@/features/imports/header-mapper";
import { validateRow } from "@/features/imports/validators";
import {
  parseWorkbook,
  validateImportFile,
} from "@/features/imports/workbook-parser";
import { fictionalRow, HEADER_ROW, workbookBuffer } from "./helpers";

describe("file validation", () => {
  it("accepts a valid .xlsx filename within the size limit", () => {
    expect(validateImportFile("registrations.xlsx", 2048)).toEqual([]);
  });

  it("rejects wrong extensions", () => {
    for (const filename of [
      "registrations.xls",
      "registrations.xlsm",
      "registrations.csv",
      "registrations.pdf",
    ]) {
      const issues = validateImportFile(filename, 2048);
      expect(issues.map((issue) => issue.code)).toContain("invalid_extension");
    }
  });

  it("rejects oversized files", () => {
    const issues = validateImportFile(
      "registrations.xlsx",
      MAX_FILE_SIZE_BYTES + 1
    );
    expect(issues.map((issue) => issue.code)).toContain("file_too_large");
  });

  it("rejects empty files", () => {
    const issues = validateImportFile("registrations.xlsx", 0);
    expect(issues.map((issue) => issue.code)).toContain("empty_file");
  });

  it("parses a valid XLSX workbook", () => {
    const parsed = parseWorkbook(
      workbookBuffer([
        { name: "Registrations", aoa: [HEADER_ROW, fictionalRow()] },
      ])
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.workbook.sheets).toHaveLength(1);
      expect(parsed.workbook.sheets[0].rows).toHaveLength(2);
    }
  });

  it("rejects an unreadable workbook", () => {
    // A corrupted buffer that looks like a zip archive but is not one.
    const corrupted = Buffer.concat([
      Buffer.from("PK"),
      Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    ]);
    const parsed = parseWorkbook(corrupted);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issue.code).toBe("unreadable_workbook");
    }
  });

  it("flags a row for review when a mapped cell contains a formula", () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([HEADER_ROW, fictionalRow()]);
    // Place a formula into the fee_total cell of the data row.
    const feeColumn = HEADER_ROW.indexOf("fee_total");
    const address = XLSX.utils.encode_cell({ r: 1, c: feeColumn });
    sheet[address] = { t: "n", v: 50, f: "25+25" } satisfies XLSX.CellObject;
    XLSX.utils.book_append_sheet(book, sheet, "Registrations");
    const buffer = XLSX.write(book, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;

    const parsed = parseWorkbook(buffer);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const rows = parsed.workbook.sheets[0].rows;
    const mapping = mapHeaders(rows[0]);
    expect(mapping.ok).toBe(true);
    if (!mapping.ok) {
      return;
    }
    const validated = validateRow(rows[1], mapping.mapping, 2);
    expect(
      validated.warnings.map((warning) => warning.code)
    ).toContain("formula_in_row");
    // The cached value is used; the formula itself is never evaluated.
    expect(validated.normalized?.fee_total).toBe(50);
  });
});
