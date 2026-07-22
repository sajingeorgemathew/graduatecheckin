/**
 * Static checks on the Google Apps Script sender. These read the .gs source
 * and prove the required safeguards are present without executing Apps Script.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const scriptDir = fileURLToPath(
  new URL("../../../google-apps-script/graduation-ticket-sender", import.meta.url)
);

function read(file: string): string {
  return readFileSync(join(scriptDir, file), "utf8");
}

describe("Apps Script sender safeguards", () => {
  it("uses LockService so concurrent runs cannot double-send", () => {
    expect(read("Sending.gs")).toContain("LockService.getScriptLock");
  });

  it("enforces the per-run maximum", () => {
    const source = read("Sending.gs");
    expect(source).toContain("maxPerRun_");
    expect(source).toContain("perRunCap");
  });

  it("enforces the production confirmation phrase", () => {
    expect(read("Config.gs")).toContain("SEND CONVOCATION 2026 TICKETS");
    expect(read("Sending.gs")).toContain("assertProductionUnlocked_");
    expect(read("Sending.gs")).toContain("clearProductionConfirmation_");
  });

  it("enforces the authorized sender for production", () => {
    expect(read("Sending.gs")).toContain("assertSenderAllowed_");
    expect(read("Config.gs")).toContain("office@torontoacademy.ca");
  });

  it("sends test mail only to the internal test recipient", () => {
    const source = read("Sending.gs");
    expect(source).toContain("TEST_RECIPIENT_EMAIL");
    expect(source).toContain("[TEST] ");
    // Test outcome never uses the production 'sent' status.
    expect(source).toContain("test_sent");
  });

  it("marks a row SENDING and flushes before sending", () => {
    const source = read("Sending.gs");
    expect(source).toContain("'SENDING'");
    expect(source).toContain("SpreadsheetApp.flush()");
  });

  it("never uses CC or BCC for graduates", () => {
    const source = read("Sending.gs");
    expect(source.toLowerCase()).not.toContain("cc:");
    expect(source.toLowerCase()).not.toContain("bcc:");
  });

  it("uses MailApp for sending and invokes GmailApp only for bounce review", () => {
    expect(read("Sending.gs")).toContain("MailApp.sendEmail");
    // The sender never calls into GmailApp; only the bounce reviewer does.
    expect(read("Sending.gs")).not.toContain("GmailApp.");
    expect(read("BounceReview.gs")).toContain("GmailApp.search");
  });

  it("installs no automatic sending trigger", () => {
    for (const file of ["Code.gs", "Sending.gs"]) {
      const source = read(file);
      expect(source).not.toContain("ScriptApp.newTrigger");
      expect(source).not.toContain("timeBased");
    }
  });

  it("creates every required tab in setupWorkbook", () => {
    const source = read("Code.gs");
    for (const tab of ["CONFIG", "SUMMARY", "QUEUE", "LOG", "BOUNCE"]) {
      expect(source).toContain(`TAB.${tab}`);
    }
  });

  it("verifies the PDF checksum before sending", () => {
    expect(read("Sending.gs")).toContain("pdf_checksum_mismatch");
    expect(read("Sending.gs")).toContain("sha256Hex_");
  });

  it("exports results with formula-injection neutralization", () => {
    const source = read("Results.gs");
    expect(source).toContain("FORMULA_PREFIXES");
    expect(source).toContain("csvCell_");
  });

  it("ships only synthetic sample data", () => {
    const sample = read("sample-send-queue.csv");
    expect(sample).toContain("example.com");
    expect(sample.toLowerCase()).toContain("sample");
  });
});

describe("CHECKIN-09C active-batch isolation and export", () => {
  it("exporting never sends email or touches Gmail", () => {
    const source = read("Results.gs");
    expect(source).not.toContain("MailApp");
    expect(source).not.toContain("GmailApp");
    expect(source).not.toContain("sendEmail");
  });

  it("exporting creates no send attempt", () => {
    const source = read("Results.gs");
    // The exporter must not append to the log or change a queue row status.
    expect(source).not.toContain("appendLog_");
    expect(source).not.toContain("setStatus_");
    expect(source).not.toContain("sendOneRow_");
    expect(source).not.toContain("TAB.QUEUE");
  });

  it("default export selects only new, unexported, active-batch rows", () => {
    const source = read("Results.gs");
    expect(source).toContain("selectExportRows_");
    expect(source).toContain("exportNewResultsForActiveBatch");
    expect(source).toContain("ACTIVE_BATCH_FIELDS.CODE");
    expect(source).toContain("ACTIVE_BATCH_FIELDS.MODE");
  });

  it("shows the zero-new message and never writes an empty file", () => {
    const source = read("Results.gs");
    expect(source).toContain("No new results are available for the active batch.");
    // The zero-row branch returns before any DriveApp.createFile call, which
    // appears only once, after the selection length check.
    const beforeCreate = source.split("DriveApp.createFile")[0];
    expect(beforeCreate).toContain("selection.rows.length === 0");
  });

  it("only marks rows exported after the Drive file is created", () => {
    const source = read("Results.gs");
    const create = source.indexOf("DriveApp.createFile");
    const mark = source.indexOf("setValue('exported')");
    expect(create).toBeGreaterThan(0);
    expect(mark).toBeGreaterThan(create);
  });

  it("offers an explicit active-batch re-export recovery action", () => {
    expect(read("Results.gs")).toContain("reExportAllResultsForActiveBatch");
    expect(read("Code.gs")).toContain("Re-export All Results for Active Batch");
  });

  it("replaces the old export-everything menu action", () => {
    const code = read("Code.gs");
    expect(code).toContain("exportNewResultsForActiveBatch");
    expect(code).not.toContain("exportResultsCsv");
  });

  it("records the true batch code on every Send Log row", () => {
    const sending = read("Sending.gs");
    expect(sending).toContain("delivery_batch_code: row.delivery_batch_code");
    expect(read("Config.gs")).toContain("delivery_batch_code");
  });

  it("scopes every send to the active batch and mode", () => {
    const source = read("Sending.gs");
    expect(source).toContain("rowMatchesActiveBatch_");
    expect(source).toContain("ACTIVE_BATCH_FIELDS.CODE");
    expect(source).toContain("ACTIVE_BATCH_FIELDS.MODE");
  });

  it("rejects mixed queues and guards replacement on load", () => {
    const source = read("Validation.gs");
    expect(source).toContain("evaluateQueueIsolation_");
    expect(source).toContain("queueReplacementDecision_");
    expect(source).toContain("archiveActiveQueue_");
  });

  it("populates the protected active-batch identity from the loaded queue", () => {
    const source = read("Validation.gs");
    expect(source).toContain("ACTIVE_BATCH_FIELDS.CODE");
    expect(source).toContain("ACTIVE_BATCH_FIELDS.MODE");
    expect(source).toContain("ACTIVE_BATCH_FIELDS.EVENT");
    expect(source).toContain("ACTIVE_BATCH_FIELDS.LOADED_AT");
  });
});
