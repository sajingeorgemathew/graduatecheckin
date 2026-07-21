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
