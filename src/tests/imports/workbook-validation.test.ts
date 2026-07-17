import { describe, expect, it } from "vitest";
import { mapHeaders } from "@/features/imports/header-mapper";
import type { HeaderMapping, ParsedCell } from "@/features/imports/types";
import { validateWorkbookRows } from "@/features/imports/validators";
import { fictionalRow, HEADER_ROW, toParsedRow } from "./helpers";
import type { FictionalRowInput } from "./helpers";

function mapping(): HeaderMapping {
  const result = mapHeaders(toParsedRow(HEADER_ROW));
  if (!result.ok) {
    throw new Error("expected headers should map");
  }
  return result.mapping;
}

function dataRows(inputs: FictionalRowInput[]): ParsedCell[][] {
  return inputs.map((input) => toParsedRow(fictionalRow(input)));
}

describe("workbook validation", () => {
  it("marks duplicate order IDs as errors on every affected row", () => {
    const validated = validateWorkbookRows(
      dataRows([
        { orderId: "TEST-1" },
        { orderId: "TEST-1", email: "second.person@example.com" },
        { orderId: "TEST-2", email: "third.person@example.com" },
      ]),
      mapping()
    );
    expect(
      validated[0].errors.map((issue) => issue.code)
    ).toContain("duplicate_order_id");
    expect(
      validated[1].errors.map((issue) => issue.code)
    ).toContain("duplicate_order_id");
    expect(validated[2].errors).toEqual([]);
  });

  it("marks duplicate emails as warnings only", () => {
    const validated = validateWorkbookRows(
      dataRows([
        { orderId: "TEST-1", email: "family.shared@example.com" },
        { orderId: "TEST-2", email: "family.shared@example.com" },
      ]),
      mapping()
    );
    for (const row of validated) {
      expect(row.errors).toEqual([]);
      expect(row.warnings.map((issue) => issue.code)).toContain(
        "duplicate_email"
      );
    }
  });

  it("treats a missing email as a warning, not a failure", () => {
    const validated = validateWorkbookRows(
      dataRows([{ orderId: "TEST-1", email: null }]),
      mapping()
    );
    expect(validated[0].errors).toEqual([]);
    expect(validated[0].warnings.map((issue) => issue.code)).toContain(
      "missing_email"
    );
    expect(validated[0].normalized).not.toBeNull();
  });

  it("treats a missing name as an error", () => {
    const validated = validateWorkbookRows(
      dataRows([{ orderId: "TEST-1", fullName: null }]),
      mapping()
    );
    expect(validated[0].errors.map((issue) => issue.code)).toContain(
      "missing_full_name"
    );
    expect(validated[0].normalized).toBeNull();
  });

  it("keeps failed orders importable but marked failed", () => {
    const validated = validateWorkbookRows(
      dataRows([{ orderId: "TEST-1", status: "failed" }]),
      mapping()
    );
    expect(validated[0].errors).toEqual([]);
    expect(validated[0].normalized?.registration_status).toBe("failed");
    expect(validated[0].normalized?.payment_status).toBe("failed");
  });

  it("warns for unknown source statuses", () => {
    const validated = validateWorkbookRows(
      dataRows([{ orderId: "TEST-1", status: "on-hold" }]),
      mapping()
    );
    expect(validated[0].warnings.map((issue) => issue.code)).toContain(
      "unknown_source_status"
    );
    expect(validated[0].normalized?.registration_status).toBe(
      "review_required"
    );
  });

  it("warns when a guest cell contains multiple names", () => {
    const validated = validateWorkbookRows(
      dataRows([{ orderId: "TEST-1", guest1: "Pat Example and Sam Example" }]),
      mapping()
    );
    expect(validated[0].warnings.map((issue) => issue.code)).toContain(
      "multiple_guest_names"
    );
    // The cell still counts as exactly one adult guest.
    expect(validated[0].normalized?.registered_adult_guests).toBe(1);
  });

  it("enforces the combined child limit", () => {
    const validated = validateWorkbookRows(
      dataRows([{ orderId: "TEST-1", kids0to4: 2, kids4to10: 1 }]),
      mapping()
    );
    expect(validated[0].errors.map((issue) => issue.code)).toContain(
      "too_many_children"
    );
  });

  it("computes the expected party size and never trusts a source total", () => {
    const validated = validateWorkbookRows(
      dataRows([
        {
          orderId: "TEST-1",
          guest1: "Guest One Example",
          guest2: "Guest Two Example",
          kids0to4: 1,
          kids4to10: 1,
        },
      ]),
      mapping()
    );
    expect(validated[0].normalized?.expected_party_size).toBe(5);
  });

  it("normalizes Kids (4 to 10) into the 5 to 10 category", () => {
    const validated = validateWorkbookRows(
      dataRows([{ orderId: "TEST-1", kids4to10: "1 child" }]),
      mapping()
    );
    expect(validated[0].normalized?.registered_children_5_10).toBe(1);
    expect(validated[0].normalized?.registered_children_0_4).toBe(0);
  });

  it("warns when fee tax total and tax total differ", () => {
    const validated = validateWorkbookRows(
      dataRows([{ orderId: "TEST-1", feeTaxTotal: 10, taxTotal: 9 }]),
      mapping()
    );
    expect(validated[0].warnings.map((issue) => issue.code)).toContain(
      "tax_mismatch"
    );
    // tax_total is stored; fee_tax_total is only a comparison value.
    expect(validated[0].normalized?.tax_total).toBe(9);
  });
});
