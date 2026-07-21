/**
 * Export manifest CSV, formula-injection protection and batch summary.
 * All fixtures are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  buildBatchSummary,
  buildManifestCsv,
  csvCell,
  manifestChecksum,
  MANIFEST_COLUMNS,
  neutralizeFormula,
} from "@/features/ticket-documents/manifest";
import type { ExportManifestRow } from "@/features/ticket-documents/types";

function manifestRow(
  overrides: Partial<ExportManifestRow> = {}
): ExportManifestRow {
  return {
    batchCode: "TAE-EXP-20260720120000-01",
    exportItemId: "11111111-2222-4333-8444-555555555555",
    eventTitle: "Convocation Ceremony 2026",
    graduateName: "Avery Testerton",
    recipientEmail: "avery.testerton@example.invalid",
    ticketCode: "TAE-9F4K-2QX7",
    documentVersion: "1",
    pdfFileName: "TAE-Convocation-2026-TAE-9F4K-2QX7-V1.pdf",
    pdfSha256: "a".repeat(64),
    graduateCount: "1",
    adultGuestCount: "1",
    adultGuestNames: "Jordan Sampleford",
    child04Count: "0",
    child510Count: "0",
    totalPartyCount: "2",
    documentGeneratedAt: "2026-07-20T12:00:00.000Z",
    batchCreatedAt: "2026-07-20T12:05:00.000Z",
    exportPurpose: "initial",
    itemStatus: "ready",
    ...overrides,
  };
}

describe("spreadsheet formula injection protection", () => {
  it.each(["=", "+", "-", "@"])(
    "neutralizes a value beginning with %s",
    (prefix) => {
      const value = `${prefix}HYPERLINK("http://example.invalid")`;
      expect(neutralizeFormula(value)).toBe(`'${value}`);
    }
  );

  it("neutralizes a formula hidden behind leading whitespace", () => {
    expect(neutralizeFormula("\t=1+1")).toBe("'=1+1");
    expect(neutralizeFormula("\r@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("leaves an ordinary value untouched", () => {
    expect(neutralizeFormula("Avery Testerton")).toBe("Avery Testerton");
    expect(neutralizeFormula("")).toBe("");
  });

  it("quotes and escapes embedded quotes and commas", () => {
    expect(csvCell('Smith, "AJ"')).toBe('"Smith, ""AJ"""');
  });

  it("protects a malicious graduate name in a generated manifest", () => {
    const csv = buildManifestCsv([
      manifestRow({ graduateName: '=cmd|"/c calc"!A1' }),
    ]);
    expect(csv).toContain(`"'=cmd|""/c calc""!A1"`);
    // The raw formula must never appear unquoted at the start of a field.
    expect(csv).not.toContain(',=cmd');
  });
});

describe("manifest csv", () => {
  it("emits the required header row in order", () => {
    const csv = buildManifestCsv([]);
    const header = csv.split("\r\n")[0];
    for (const column of MANIFEST_COLUMNS) {
      expect(header).toContain(column);
    }
    expect(MANIFEST_COLUMNS).toHaveLength(19);
  });

  it("includes every required field for a row", () => {
    const csv = buildManifestCsv([manifestRow()]);
    expect(csv).toContain("TAE-EXP-20260720120000-01");
    expect(csv).toContain("Convocation Ceremony 2026");
    expect(csv).toContain("Avery Testerton");
    expect(csv).toContain("avery.testerton@example.invalid");
    expect(csv).toContain("TAE-9F4K-2QX7");
    expect(csv).toContain("TAE-Convocation-2026-TAE-9F4K-2QX7-V1.pdf");
    expect(csv).toContain("a".repeat(64));
  });

  it("never includes credential material", () => {
    const csv = buildManifestCsv([manifestRow()]);
    expect(csv.toLowerCase()).not.toContain("tae-grad1");
    expect(csv.toLowerCase()).not.toContain("service_role");
    expect(csv.toLowerCase()).not.toContain("token");
    expect(csv.toLowerCase()).not.toContain("secret");
    expect(csv).not.toContain("https://");
  });

  it("uses CRLF line endings", () => {
    const csv = buildManifestCsv([manifestRow()]);
    expect(csv).toContain("\r\n");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("produces a stable checksum for identical content", () => {
    const csv = buildManifestCsv([manifestRow()]);
    expect(manifestChecksum(csv)).toBe(manifestChecksum(csv));
    expect(manifestChecksum(csv)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("batch summary", () => {
  const summary = buildBatchSummary({
    batchCode: "TAE-EXP-20260720120000-01",
    eventTitle: "Convocation Ceremony 2026",
    purpose: "initial",
    createdAt: "2026-07-20T12:05:00.000Z",
    exportedAt: "2026-07-20T12:10:00.000Z",
    itemCount: 25,
    pdfCount: 24,
    excludedCount: 1,
    failedCount: 0,
    manifestSha256: "b".repeat(64),
    generatedByRole: "administrator",
  });

  it("reports every required field", () => {
    expect(summary).toContain("TAE-EXP-20260720120000-01");
    expect(summary).toContain("Convocation Ceremony 2026");
    expect(summary).toContain("initial");
    expect(summary).toContain("25");
    expect(summary).toContain("24");
    expect(summary).toContain("b".repeat(64));
    expect(summary).toContain("administrator");
  });

  it("states that CHECKIN-09A did not email the batch", () => {
    expect(summary).toContain("prepared but NOT emailed by CHECKIN-09A");
  });

  it("contains no secret", () => {
    expect(summary.toLowerCase()).not.toContain("secret");
    expect(summary.toLowerCase()).not.toContain("service_role");
    expect(summary.toLowerCase()).not.toContain("tae-grad1");
  });
});
