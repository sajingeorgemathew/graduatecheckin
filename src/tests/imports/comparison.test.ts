import { describe, expect, it } from "vitest";
import {
  compareRow,
  finalRowResult,
  findMissingExisting,
} from "@/features/imports/comparison";
import type {
  ExistingRegistrationSummary,
  NormalizedImportRow,
} from "@/features/imports/types";

function normalizedRow(
  overrides: Partial<NormalizedImportRow> = {}
): NormalizedImportRow {
  return {
    source_row_number: 2,
    source_registration_id: "TEST-1",
    graduate_full_name: "Fictional Test Person",
    email: "fictional.person@example.com",
    phone: "4165550999",
    gown_size: "M",
    name_pronunciation: null,
    guest_1_name: null,
    guest_2_name: null,
    registered_adult_guests: 0,
    registered_children_0_4: 0,
    registered_children_5_10: 0,
    expected_party_size: 1,
    source_order_status: "processing",
    registration_status: "eligible",
    payment_status: "amount_recorded",
    fee_total: 50,
    tax_total: 6.5,
    order_total: 56.5,
    source_order_date: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function existingRegistration(
  overrides: Partial<ExistingRegistrationSummary> = {}
): ExistingRegistrationSummary {
  return {
    id: "00000000-0000-4000-8000-000000000901",
    source_registration_id: "TEST-1",
    graduate_full_name: "Fictional Test Person",
    email: "fictional.person@example.com",
    phone: "4165550999",
    gown_size: "M",
    name_pronunciation: null,
    registered_adult_guests: 0,
    registered_children_0_4: 0,
    registered_children_5_10: 0,
    registration_status: "eligible",
    payment_status: "amount_recorded",
    fee_total: 50,
    tax_total: 6.5,
    order_total: 56.5,
    source_order_date: "2026-05-01T00:00:00+00:00",
    adult_guest_names: [],
    ...overrides,
  };
}

describe("preview comparison", () => {
  it("marks a row without a matching registration as new", () => {
    const comparison = compareRow(normalizedRow(), undefined);
    expect(comparison.action).toBe("new");
    expect(comparison.existingRegistrationId).toBeNull();
  });

  it("marks a matching registration with differences as update", () => {
    const comparison = compareRow(
      normalizedRow({ gown_size: "L" }),
      existingRegistration()
    );
    expect(comparison.action).toBe("update");
    expect(comparison.changedFields).toContain("gown_size");
  });

  it("marks a matching registration without differences as unchanged", () => {
    const comparison = compareRow(normalizedRow(), existingRegistration());
    expect(comparison.action).toBe("unchanged");
    expect(comparison.changedFields).toEqual([]);
  });

  it("treats equivalent timestamps with different formats as equal", () => {
    const comparison = compareRow(
      normalizedRow({ source_order_date: "2026-05-01T00:00:00.000Z" }),
      existingRegistration({ source_order_date: "2026-05-01T00:00:00+00:00" })
    );
    expect(comparison.action).toBe("unchanged");
  });

  it("detects adult guest name changes", () => {
    const comparison = compareRow(
      normalizedRow({
        guest_1_name: "Fictional Guest One",
        registered_adult_guests: 1,
        expected_party_size: 2,
      }),
      existingRegistration({
        registered_adult_guests: 1,
        adult_guest_names: ["A Different Fictional Guest"],
      })
    );
    expect(comparison.action).toBe("update");
    expect(comparison.changedFields).toContain("adult_guest_names");
  });

  it("never matches by name or email", () => {
    // Same fictional name and email but a different order ID must be new.
    const comparison = compareRow(
      normalizedRow({ source_registration_id: "TEST-999" }),
      undefined
    );
    expect(comparison.action).toBe("new");
  });
});

describe("final row result", () => {
  it("prioritizes errors, then warnings, then the comparison action", () => {
    const error = [{ code: "x", message: "m" }];
    const warning = [{ code: "y", message: "m" }];
    expect(finalRowResult(error, warning, "new")).toBe("error");
    expect(finalRowResult([], warning, "new")).toBe("warning");
    expect(finalRowResult([], [], "new")).toBe("new");
    expect(finalRowResult([], [], "update")).toBe("update");
    expect(finalRowResult([], [], "unchanged")).toBe("unchanged");
  });

  it("treats rows without a comparison action as errors", () => {
    expect(finalRowResult([], [], null)).toBe("error");
  });
});

describe("missing existing registrations", () => {
  it("lists registrations absent from the upload without touching them", () => {
    const existing = [
      existingRegistration(),
      existingRegistration({
        id: "00000000-0000-4000-8000-000000000902",
        source_registration_id: "TEST-2",
        graduate_full_name: "Second Fictional Person",
      }),
    ];
    const missing = findMissingExisting(existing, new Set(["TEST-1"]));
    expect(missing).toHaveLength(1);
    expect(missing[0].source_registration_id).toBe("TEST-2");
  });

  it("reports nothing when every registration appears in the upload", () => {
    const existing = [existingRegistration()];
    expect(findMissingExisting(existing, new Set(["TEST-1"]))).toEqual([]);
  });
});
