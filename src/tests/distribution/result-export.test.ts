/**
 * Active-batch result export selection.
 *
 * Loads the pure export-selection functions from Results.gs and the pure
 * active-batch row matcher from Sending.gs into a Node VM (no Sheet, no Drive,
 * no Mail API) and proves the exact regression the ticket names: a Send Log
 * that still holds an attempt from a previous batch must never contribute that
 * attempt to a normal active-batch export.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

const scriptDir = fileURLToPath(
  new URL("../../../google-apps-script/graduation-ticket-sender", import.meta.url)
);

interface Selection {
  rows: string[][];
  rowNumbers: number[];
  skippedExported: number;
  skippedOtherBatch: number;
  skippedNonTerminal: number;
}

function loadResults(): {
  selectExportRows_: (
    dataRows: string[][],
    colIndex: Record<string, number>,
    activeBatchCode: string,
    activeMode: string,
    includeExported: boolean
  ) => Selection;
  isTerminalOutcome_: (outcome: string) => boolean;
  logColumnIndex_: (header: string[]) => Record<string, number>;
} {
  const source = readFileSync(join(scriptDir, "Results.gs"), "utf8");
  const sandbox: Record<string, unknown> = {};
  runInContext(source, createContext(sandbox));
  return sandbox as never;
}

function loadSending(): {
  rowMatchesActiveBatch_: (
    row: { delivery_batch_code: string; delivery_mode: string },
    activeBatchCode: string,
    activeMode: string
  ) => boolean;
} {
  const source = readFileSync(join(scriptDir, "Sending.gs"), "utf8");
  const sandbox: Record<string, unknown> = {};
  runInContext(source, createContext(sandbox));
  return sandbox as never;
}

const LOG_HEADER = [
  "attempt_reference",
  "delivery_reference",
  "row_signature",
  "attempt_number",
  "intended_recipient_email",
  "actual_recipient_email",
  "delivery_mode",
  "outcome",
  "attempted_at",
  "sent_by",
  "pdf_file_name",
  "pdf_sha256",
  "error_code",
  "error_message",
  "bounce_detected_at",
  "delivery_batch_code",
  "export_status",
  "exported_at",
  "export_file_name",
  "export_run_reference",
];

function logRow(overrides: {
  deliveryReference: string;
  batchCode: string;
  mode: string;
  outcome: string;
  exportStatus?: string;
}): string[] {
  const row = LOG_HEADER.map(() => "");
  row[0] = "AT-" + overrides.deliveryReference;
  row[1] = overrides.deliveryReference;
  row[6] = overrides.mode;
  row[7] = overrides.outcome;
  row[15] = overrides.batchCode;
  row[16] = overrides.exportStatus ?? "";
  return row;
}

const ACTIVE = "DLV-2026-BDH4YG";
const OTHER = "DLV-2026-DAEJ9X";

describe("selectExportRows_", () => {
  it("excludes an attempt from a previous batch left in the Send Log", () => {
    const { selectExportRows_, logColumnIndex_ } = loadResults();
    const colIndex = logColumnIndex_(LOG_HEADER);
    const rows = [
      logRow({ deliveryReference: "DR-GHVDLHZG", batchCode: ACTIVE, mode: "production", outcome: "sent" }),
      logRow({ deliveryReference: "DR-DAEJ9XQY", batchCode: OTHER, mode: "production", outcome: "sent" }),
    ];
    const selection = selectExportRows_(rows, colIndex, ACTIVE, "production", false);
    expect(selection.rows).toHaveLength(1);
    expect(selection.rows[0][colIndex.delivery_reference]).toBe("DR-GHVDLHZG");
    expect(selection.skippedOtherBatch).toBe(1);
  });

  it("includes only the active mode", () => {
    const { selectExportRows_, logColumnIndex_ } = loadResults();
    const colIndex = logColumnIndex_(LOG_HEADER);
    const rows = [
      logRow({ deliveryReference: "DR-1", batchCode: ACTIVE, mode: "production", outcome: "sent" }),
      logRow({ deliveryReference: "DR-2", batchCode: ACTIVE, mode: "test", outcome: "test_sent" }),
    ];
    const selection = selectExportRows_(rows, colIndex, ACTIVE, "production", false);
    expect(selection.rows).toHaveLength(1);
    expect(selection.rows[0][colIndex.delivery_reference]).toBe("DR-1");
  });

  it("excludes already-exported rows from the default export", () => {
    const { selectExportRows_, logColumnIndex_ } = loadResults();
    const colIndex = logColumnIndex_(LOG_HEADER);
    const rows = [
      logRow({ deliveryReference: "DR-1", batchCode: ACTIVE, mode: "production", outcome: "sent", exportStatus: "exported" }),
      logRow({ deliveryReference: "DR-2", batchCode: ACTIVE, mode: "production", outcome: "sent" }),
    ];
    const selection = selectExportRows_(rows, colIndex, ACTIVE, "production", false);
    expect(selection.rows).toHaveLength(1);
    expect(selection.rows[0][colIndex.delivery_reference]).toBe("DR-2");
    expect(selection.skippedExported).toBe(1);
  });

  it("re-export includes already-exported rows but stays active-batch scoped", () => {
    const { selectExportRows_, logColumnIndex_ } = loadResults();
    const colIndex = logColumnIndex_(LOG_HEADER);
    const rows = [
      logRow({ deliveryReference: "DR-1", batchCode: ACTIVE, mode: "production", outcome: "sent", exportStatus: "exported" }),
      logRow({ deliveryReference: "DR-2", batchCode: ACTIVE, mode: "production", outcome: "sent" }),
      logRow({ deliveryReference: "DR-3", batchCode: OTHER, mode: "production", outcome: "sent" }),
    ];
    const selection = selectExportRows_(rows, colIndex, ACTIVE, "production", true);
    expect(selection.rows).toHaveLength(2);
    const references = selection.rows.map((r) => r[colIndex.delivery_reference]);
    expect(references).toContain("DR-1");
    expect(references).toContain("DR-2");
    expect(references).not.toContain("DR-3");
  });

  it("selects zero rows when nothing new remains (no empty file is created)", () => {
    const { selectExportRows_, logColumnIndex_ } = loadResults();
    const colIndex = logColumnIndex_(LOG_HEADER);
    const rows = [
      logRow({ deliveryReference: "DR-1", batchCode: ACTIVE, mode: "production", outcome: "sent", exportStatus: "exported" }),
    ];
    const selection = selectExportRows_(rows, colIndex, ACTIVE, "production", false);
    expect(selection.rows).toHaveLength(0);
  });

  it("skips non-terminal outcomes", () => {
    const { selectExportRows_, logColumnIndex_, isTerminalOutcome_ } = loadResults();
    expect(isTerminalOutcome_("sent")).toBe(true);
    expect(isTerminalOutcome_("skipped")).toBe(false);
    const colIndex = logColumnIndex_(LOG_HEADER);
    const rows = [
      logRow({ deliveryReference: "DR-1", batchCode: ACTIVE, mode: "production", outcome: "skipped" }),
    ];
    const selection = selectExportRows_(rows, colIndex, ACTIVE, "production", false);
    expect(selection.rows).toHaveLength(0);
    expect(selection.skippedNonTerminal).toBe(1);
  });
});

describe("rowMatchesActiveBatch_", () => {
  it("matches only the active batch and mode", () => {
    const { rowMatchesActiveBatch_ } = loadSending();
    expect(
      rowMatchesActiveBatch_(
        { delivery_batch_code: ACTIVE, delivery_mode: "production" },
        ACTIVE,
        "production"
      )
    ).toBe(true);
    expect(
      rowMatchesActiveBatch_(
        { delivery_batch_code: OTHER, delivery_mode: "production" },
        ACTIVE,
        "production"
      )
    ).toBe(false);
    expect(
      rowMatchesActiveBatch_(
        { delivery_batch_code: ACTIVE, delivery_mode: "test" },
        ACTIVE,
        "production"
      )
    ).toBe(false);
  });

  it("refuses every row when no active batch is set", () => {
    const { rowMatchesActiveBatch_ } = loadSending();
    expect(
      rowMatchesActiveBatch_(
        { delivery_batch_code: ACTIVE, delivery_mode: "production" },
        "",
        ""
      )
    ).toBe(false);
  });
});
