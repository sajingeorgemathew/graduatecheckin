/**
 * ZIP packaging structure. All fixtures are synthetic.
 *
 * The packaging helper reads from the database and private storage, so
 * these tests exercise the archive contract directly against the same
 * fflate primitives the exporter uses, proving the layout, determinism and
 * round-trip integrity of the package.
 */

import { unzipSync, zipSync, type Zippable } from "fflate";
import { describe, expect, it } from "vitest";

import { ZIP_FIXED_MTIME } from "@/features/ticket-documents/batches";
import {
  buildBatchSummary,
  buildManifestCsv,
  manifestChecksum,
} from "@/features/ticket-documents/manifest";
import type { ExportManifestRow } from "@/features/ticket-documents/types";

const BATCH_CODE = "TAE-EXP-20260720120000-01";

function manifestRow(index: number): ExportManifestRow {
  return {
    batchCode: BATCH_CODE,
    exportItemId: `item-${index}`,
    eventTitle: "Convocation Ceremony 2026",
    graduateName: `Graduate ${index}`,
    recipientEmail: `graduate${index}@example.invalid`,
    ticketCode: `TAE-000${index}`,
    documentVersion: "1",
    pdfFileName: `TAE-Convocation-2026-TAE-000${index}-V1.pdf`,
    pdfSha256: "a".repeat(64),
    graduateCount: "1",
    adultGuestCount: "0",
    adultGuestNames: "",
    child04Count: "0",
    child510Count: "0",
    totalPartyCount: "1",
    documentGeneratedAt: "2026-07-20T12:00:00.000Z",
    batchCreatedAt: "2026-07-20T12:05:00.000Z",
    exportPurpose: "initial",
    itemStatus: "ready",
  };
}

/** Mirrors the archive the exporter assembles. */
function buildArchive(count: number): Uint8Array {
  const rows = Array.from({ length: count }, (_, index) => manifestRow(index));
  const csv = buildManifestCsv(rows);
  const files: Zippable = {
    [`${BATCH_CODE}/manifest.csv`]: new TextEncoder().encode(csv),
    [`${BATCH_CODE}/batch-summary.txt`]: new TextEncoder().encode(
      buildBatchSummary({
        batchCode: BATCH_CODE,
        eventTitle: "Convocation Ceremony 2026",
        purpose: "initial",
        createdAt: "2026-07-20T12:05:00.000Z",
        exportedAt: "2026-07-20T12:10:00.000Z",
        itemCount: count,
        pdfCount: count,
        excludedCount: 0,
        failedCount: 0,
        manifestSha256: manifestChecksum(csv),
        generatedByRole: "administrator",
      })
    ),
  };
  for (const row of rows) {
    files[`${BATCH_CODE}/PDFs/${row.pdfFileName}`] = new TextEncoder().encode(
      `%PDF-1.7 synthetic ${row.ticketCode}`
    );
  }
  return zipSync(files, { level: 6, mtime: ZIP_FIXED_MTIME });
}

describe("batch zip package", () => {
  const archive = buildArchive(3);
  const entries = unzipSync(archive);
  const names = Object.keys(entries).sort();

  it("nests everything under the batch code", () => {
    for (const name of names) {
      expect(name.startsWith(`${BATCH_CODE}/`)).toBe(true);
    }
  });

  it("contains the manifest and the batch summary", () => {
    expect(names).toContain(`${BATCH_CODE}/manifest.csv`);
    expect(names).toContain(`${BATCH_CODE}/batch-summary.txt`);
  });

  it("places every PDF under a PDFs folder with the required file name", () => {
    const pdfs = names.filter((name) => name.includes("/PDFs/"));
    expect(pdfs).toHaveLength(3);
    for (const name of pdfs) {
      expect(name).toMatch(
        /^TAE-EXP-\d{14}-\d{2}\/PDFs\/TAE-Convocation-2026-.+-V\d+\.pdf$/
      );
    }
  });

  it("round-trips the manifest content intact", () => {
    const csv = new TextDecoder().decode(entries[`${BATCH_CODE}/manifest.csv`]);
    expect(csv).toContain("batch_code");
    expect(csv).toContain("TAE-0001");
    expect(csv).toContain("graduate1@example.invalid");
  });

  it("round-trips PDF bytes intact", () => {
    const pdf = entries[
      `${BATCH_CODE}/PDFs/TAE-Convocation-2026-TAE-0000-V1.pdf`
    ];
    expect(new TextDecoder().decode(pdf)).toContain("%PDF-");
  });

  it("states in the summary that nothing was emailed", () => {
    const summary = new TextDecoder().decode(
      entries[`${BATCH_CODE}/batch-summary.txt`]
    );
    expect(summary).toContain("prepared but NOT emailed by CHECKIN-09A");
  });

  it("reproduces byte-identical archives for the same batch", () => {
    // A fixed mtime keeps the same batch logically and physically stable.
    expect(Buffer.from(buildArchive(3))).toEqual(Buffer.from(buildArchive(3)));
  });

  it("never places a PDF file name containing an email address", () => {
    for (const name of names.filter((entry) => entry.includes("/PDFs/"))) {
      expect(name).not.toContain("@");
    }
  });
});
