import { describe, expect, it } from "vitest";
import {
  normalizeChildCount,
  normalizeEmail,
  normalizeFullName,
  normalizeGuestName,
  normalizeMoney,
  normalizeOrderDate,
  normalizeOrderId,
  normalizePhone,
  normalizeSourceStatus,
} from "@/features/imports/normalizers";

describe("order ID normalization", () => {
  it("accepts numeric order IDs as trimmed text", () => {
    expect(normalizeOrderId(12045).value).toBe("12045");
  });

  it("accepts text order IDs and trims them", () => {
    expect(normalizeOrderId("  TEST-3001  ").value).toBe("TEST-3001");
  });

  it("rejects blank order IDs", () => {
    const result = normalizeOrderId("   ");
    expect(result.value).toBeNull();
    expect(result.errors.map((issue) => issue.code)).toContain(
      "missing_order_id"
    );
  });
});

describe("full name normalization", () => {
  it("collapses repeated spaces and preserves capitalization", () => {
    expect(normalizeFullName("  Fictional   McTest  ").value).toBe(
      "Fictional McTest"
    );
  });

  it("rejects blank names", () => {
    const result = normalizeFullName("");
    expect(result.errors.map((issue) => issue.code)).toContain(
      "missing_full_name"
    );
  });
});

describe("email normalization", () => {
  it("lowercases and trims emails", () => {
    expect(normalizeEmail("  Fictional.Person@Example.COM ").value).toBe(
      "fictional.person@example.com"
    );
  });

  it("warns for a blank email without failing", () => {
    const result = normalizeEmail(null);
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((issue) => issue.code)).toContain(
      "missing_email"
    );
  });

  it("warns for an invalid email structure", () => {
    const result = normalizeEmail("not-an-email");
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((issue) => issue.code)).toContain(
      "invalid_email"
    );
  });
});

describe("phone normalization", () => {
  it("keeps digits only", () => {
    expect(normalizePhone("(416) 555-0100").value).toBe("4165550100");
  });

  it("warns for a blank phone", () => {
    const result = normalizePhone("");
    expect(result.warnings.map((issue) => issue.code)).toContain(
      "missing_phone"
    );
  });

  it("warns for lengths outside 10 to 15 digits", () => {
    expect(
      normalizePhone("123").warnings.map((issue) => issue.code)
    ).toContain("invalid_phone");
    expect(
      normalizePhone("1".repeat(16)).warnings.map((issue) => issue.code)
    ).toContain("invalid_phone");
    expect(normalizePhone("1".repeat(15)).warnings).toEqual([]);
  });
});

describe("guest normalization", () => {
  it("normalizes whitespace and preserves the name", () => {
    expect(normalizeGuestName("  Fictional  Guest ", "Guest 1").value).toBe(
      "Fictional Guest"
    );
  });

  it("warns when a guest cell appears to contain multiple names", () => {
    for (const value of [
      "Pat Example and Sam Example",
      "Pat Example, Sam Example",
      "Pat Example & Sam Example",
    ]) {
      const result = normalizeGuestName(value, "Guest 1");
      expect(result.warnings.map((issue) => issue.code)).toContain(
        "multiple_guest_names"
      );
    }
  });

  it("does not warn for a single name", () => {
    expect(normalizeGuestName("Alexandra Example", "Guest 1").warnings).toEqual(
      []
    );
  });
});

describe("child count normalization", () => {
  it("treats blank as zero", () => {
    expect(normalizeChildCount(null, "children aged 0 to 4").value).toBe(0);
    expect(normalizeChildCount("", "children aged 0 to 4").value).toBe(0);
  });

  it("accepts numeric values from zero to two", () => {
    expect(normalizeChildCount(0, "children aged 0 to 4").value).toBe(0);
    expect(normalizeChildCount(2, "children aged 0 to 4").value).toBe(2);
  });

  it("extracts clear integers from text", () => {
    expect(normalizeChildCount("1 child", "children aged 0 to 4").value).toBe(1);
    expect(
      normalizeChildCount("2 children", "children aged 5 to 10").value
    ).toBe(2);
    expect(normalizeChildCount("one child", "children aged 0 to 4").value).toBe(
      1
    );
  });

  it("rejects values above two", () => {
    const result = normalizeChildCount(3, "children aged 0 to 4");
    expect(result.errors.map((issue) => issue.code)).toContain(
      "invalid_child_count"
    );
  });

  it("rejects ambiguous text", () => {
    const result = normalizeChildCount("1 or 2", "children aged 0 to 4");
    expect(result.errors.map((issue) => issue.code)).toContain(
      "invalid_child_count"
    );
  });
});

describe("money normalization", () => {
  it("defaults blank cells to zero", () => {
    expect(normalizeMoney(null, "order total").value).toBe(0);
    expect(normalizeMoney("", "order total").value).toBe(0);
  });

  it("rounds to two decimal places", () => {
    expect(normalizeMoney(12.345, "order total").value).toBe(12.35);
    expect(normalizeMoney(12.344, "order total").value).toBe(12.34);
  });

  it("parses currency text", () => {
    expect(normalizeMoney("$84.75", "order total").value).toBe(84.75);
    expect(normalizeMoney("1,084.75", "order total").value).toBe(1084.75);
  });

  it("rejects negative values", () => {
    const result = normalizeMoney(-1, "order total");
    expect(result.errors.map((issue) => issue.code)).toContain(
      "negative_money"
    );
  });

  it("rejects unreadable values", () => {
    const result = normalizeMoney("not money", "order total");
    expect(result.errors.map((issue) => issue.code)).toContain("invalid_money");
  });
});

describe("order date normalization", () => {
  it("converts Date cells to ISO timestamps", () => {
    const date = new Date(Date.UTC(2026, 4, 1, 12, 0, 0));
    expect(normalizeOrderDate(date).value).toBe("2026-05-01T12:00:00.000Z");
  });

  it("converts Excel serial numbers", () => {
    // Serial 46143 is 2026-05-01 in the 1900 date system.
    const result = normalizeOrderDate(46143);
    expect(result.value).toBe("2026-05-01T00:00:00.000Z");
  });

  it("parses recognizable text dates", () => {
    const result = normalizeOrderDate("2026-05-01T09:30:00Z");
    expect(result.value).toBe("2026-05-01T09:30:00.000Z");
  });

  it("warns for blank and invalid dates", () => {
    expect(
      normalizeOrderDate(null).warnings.map((issue) => issue.code)
    ).toContain("missing_order_date");
    expect(
      normalizeOrderDate("not a date").warnings.map((issue) => issue.code)
    ).toContain("invalid_order_date");
  });
});

describe("source status mapping", () => {
  it("maps processing with an amount to eligible and amount_recorded", () => {
    const mapping = normalizeSourceStatus("Processing", 56.5);
    expect(mapping.registrationStatus).toBe("eligible");
    expect(mapping.paymentStatus).toBe("amount_recorded");
    expect(mapping.warnings).toEqual([]);
  });

  it("never labels processing as paid", () => {
    const mapping = normalizeSourceStatus("processing", 100);
    expect(mapping.paymentStatus).not.toBe("paid");
  });

  it("maps processing with a zero total to unknown payment", () => {
    const mapping = normalizeSourceStatus("processing", 0);
    expect(mapping.paymentStatus).toBe("unknown");
  });

  it("maps failed to failed statuses", () => {
    const mapping = normalizeSourceStatus("FAILED", 56.5);
    expect(mapping.registrationStatus).toBe("failed");
    expect(mapping.paymentStatus).toBe("failed");
  });

  it("maps unknown statuses to review_required with a warning", () => {
    const mapping = normalizeSourceStatus("on-hold", 56.5);
    expect(mapping.registrationStatus).toBe("review_required");
    expect(mapping.paymentStatus).toBe("unknown");
    expect(mapping.warnings.map((issue) => issue.code)).toContain(
      "unknown_source_status"
    );
  });
});
