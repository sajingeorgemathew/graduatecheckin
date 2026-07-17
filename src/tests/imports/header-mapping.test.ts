import { describe, expect, it } from "vitest";
import { mapHeaders, selectWorksheet } from "@/features/imports/header-mapper";
import { parseWorkbook } from "@/features/imports/workbook-parser";
import { fictionalRow, HEADER_ROW, toParsedRow, workbookBuffer } from "./helpers";

function parsedWorkbookFrom(
  sheets: Array<{ name: string; aoa: Array<Array<string | number | null>> }>
) {
  const parsed = parseWorkbook(workbookBuffer(sheets));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    throw new Error("workbook should parse");
  }
  return parsed.workbook;
}

describe("header mapping", () => {
  it("accepts the exact expected header set", () => {
    const result = mapHeaders(toParsedRow(HEADER_ROW));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mapping.unexpectedHeaders).toEqual([]);
      expect(result.mapping.columns["order_id"]).toBe(0);
      expect(result.mapping.columns["order_total"]).toBe(15);
    }
  });

  it("treats a Guest 2 header with trailing whitespace as Guest 2", () => {
    const headers = HEADER_ROW.map((header) =>
      header === "Guest 2" ? "Guest 2  " : header
    );
    const result = mapHeaders(toParsedRow(headers));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mapping.columns["Guest 2"]).toBe(
        HEADER_ROW.indexOf("Guest 2")
      );
      expect(result.mapping.unexpectedHeaders).toEqual([]);
    }
  });

  it("maps reordered columns by name, never by position", () => {
    const reordered = [...HEADER_ROW].reverse();
    const result = mapHeaders(toParsedRow(reordered));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mapping.columns["order_id"]).toBe(
        reordered.indexOf("order_id")
      );
      expect(result.mapping.columns["Email"]).toBe(reordered.indexOf("Email"));
    }
  });

  it("rejects a header row missing a required header", () => {
    const headers = HEADER_ROW.filter((header) => header !== "Email");
    const result = mapHeaders(toParsedRow(headers));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingHeaders).toContain("Email");
    }
  });

  it("reports unexpected extra headers as informational notices", () => {
    const workbook = parsedWorkbookFrom([
      {
        name: "Registrations",
        aoa: [[...HEADER_ROW, "Surprise Column"], fictionalRow()],
      },
    ]);
    const selection = selectWorksheet(workbook);
    expect(selection.ok).toBe(true);
    if (selection.ok) {
      const codes = selection.selection.notices.map((notice) => notice.code);
      expect(codes).toContain("unexpected_headers");
      expect(
        selection.selection.mapping.unexpectedHeaders
      ).toContain("Surprise Column");
    }
  });

  it("uses the first of multiple matching worksheets and warns", () => {
    const workbook = parsedWorkbookFrom([
      { name: "First", aoa: [HEADER_ROW, fictionalRow()] },
      { name: "Second", aoa: [HEADER_ROW, fictionalRow()] },
    ]);
    const selection = selectWorksheet(workbook);
    expect(selection.ok).toBe(true);
    if (selection.ok) {
      expect(selection.selection.sheet.name).toBe("First");
      const codes = selection.selection.notices.map((notice) => notice.code);
      expect(codes).toContain("multiple_matching_worksheets");
    }
  });

  it("selects a matching sheet even when another sheet comes first", () => {
    const workbook = parsedWorkbookFrom([
      { name: "Notes", aoa: [["only", "some", "notes"]] },
      { name: "Data", aoa: [HEADER_ROW, fictionalRow()] },
    ]);
    const selection = selectWorksheet(workbook);
    expect(selection.ok).toBe(true);
    if (selection.ok) {
      expect(selection.selection.sheet.name).toBe("Data");
    }
  });

  it("rejects a workbook where no worksheet matches", () => {
    const workbook = parsedWorkbookFrom([
      { name: "Wrong", aoa: [["a", "b", "c"], ["1", "2", "3"]] },
    ]);
    const selection = selectWorksheet(workbook);
    expect(selection.ok).toBe(false);
    if (!selection.ok) {
      expect(selection.issue.code).toBe("missing_required_headers");
    }
  });

  it("rejects an effectively empty workbook", () => {
    const workbook = parsedWorkbookFrom([
      { name: "Empty", aoa: [[null, null], [null, null]] },
    ]);
    const selection = selectWorksheet(workbook);
    expect(selection.ok).toBe(false);
  });

  it("ignores empty rows after the last populated registration row", () => {
    const workbook = parsedWorkbookFrom([
      {
        name: "Registrations",
        aoa: [
          HEADER_ROW,
          fictionalRow(),
          Array.from(HEADER_ROW, () => null),
          Array.from(HEADER_ROW, () => null),
        ],
      },
    ]);
    const selection = selectWorksheet(workbook);
    expect(selection.ok).toBe(true);
    if (selection.ok) {
      // Header row plus exactly one data row remain.
      expect(selection.selection.sheet.rows).toHaveLength(2);
    }
  });
});
