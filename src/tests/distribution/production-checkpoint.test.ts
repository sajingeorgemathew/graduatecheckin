/**
 * CHECKIN-10A result checkpoint, runbook and production-control surfaces.
 *
 * The checkpoint counter is executed from Results.gs in a Node VM with no
 * Sheet or Mail API present; the surface checks read source only. No email is
 * sent and no real data is used.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { RUNBOOK_SECTIONS } from "@/features/distribution/runbook-content";
import {
  PRODUCTION_NORMAL_RUN_SIZE,
  PRODUCTION_PILOT_RUN_SIZE,
  RESEND_VS_REPLACEMENT_TEXT,
} from "@/features/distribution/constants";

const scriptDir = fileURLToPath(
  new URL("../../../google-apps-script/graduation-ticket-sender", import.meta.url)
);

function readScript(file: string): string {
  return readFileSync(join(scriptDir, file), "utf8");
}

function readSource(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    "utf8"
  );
}

interface ResultsSandbox {
  logColumnIndex_: (header: string[]) => Record<string, number>;
  countUnexportedAttempts_: (
    dataRows: unknown[][],
    colIndex: Record<string, number>,
    activeBatchCode: string,
    activeMode: string
  ) => number;
}

function loadResults(): ResultsSandbox {
  const sandbox: Record<string, unknown> = {};
  const context = createContext(sandbox);
  runInContext(readScript("Config.gs"), context);
  runInContext(readScript("Results.gs"), context);
  return sandbox as unknown as ResultsSandbox;
}

const gs = loadResults();

const HEADER = [
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

/** Builds one synthetic Send Log row. No real address is used. */
function logRow(options: {
  reference: string;
  mode?: string;
  outcome?: string;
  batchCode?: string;
  exportStatus?: string;
}): unknown[] {
  const row = new Array(HEADER.length).fill("");
  row[HEADER.indexOf("delivery_reference")] = options.reference;
  row[HEADER.indexOf("delivery_mode")] = options.mode ?? "production";
  row[HEADER.indexOf("outcome")] = options.outcome ?? "sent";
  row[HEADER.indexOf("intended_recipient_email")] = "synthetic@example.test";
  row[HEADER.indexOf("delivery_batch_code")] =
    options.batchCode ?? "BATCH-SYNTH-01";
  row[HEADER.indexOf("export_status")] = options.exportStatus ?? "";
  return row;
}

describe("CHECKIN-10A result checkpoint", () => {
  const colIndex = gs.logColumnIndex_(HEADER);

  it("counts attempts that have never been exported", () => {
    const rows = [
      logRow({ reference: "D-1" }),
      logRow({ reference: "D-2" }),
      logRow({ reference: "D-3" }),
    ];
    expect(
      gs.countUnexportedAttempts_(rows, colIndex, "BATCH-SYNTH-01", "production")
    ).toBe(3);
  });

  it("reports nothing waiting once every attempt has been exported", () => {
    const rows = [
      logRow({ reference: "D-1", exportStatus: "exported" }),
      logRow({ reference: "D-2", exportStatus: "exported" }),
    ];
    expect(
      gs.countUnexportedAttempts_(rows, colIndex, "BATCH-SYNTH-01", "production")
    ).toBe(0);
  });

  it("counts only the active batch, so another batch never inflates the warning", () => {
    const rows = [
      logRow({ reference: "D-1" }),
      logRow({ reference: "D-2", batchCode: "BATCH-SYNTH-02" }),
    ];
    expect(
      gs.countUnexportedAttempts_(rows, colIndex, "BATCH-SYNTH-01", "production")
    ).toBe(1);
  });

  it("keeps test and production counters independent", () => {
    const rows = [
      logRow({ reference: "D-1", mode: "production" }),
      logRow({ reference: "D-2", mode: "test", outcome: "test_sent" }),
    ];
    expect(
      gs.countUnexportedAttempts_(rows, colIndex, "BATCH-SYNTH-01", "production")
    ).toBe(1);
    expect(
      gs.countUnexportedAttempts_(rows, colIndex, "BATCH-SYNTH-01", "test")
    ).toBe(1);
  });

  it("ignores an attempt that has not reached a terminal outcome", () => {
    const rows = [logRow({ reference: "D-1", outcome: "" })];
    expect(
      gs.countUnexportedAttempts_(rows, colIndex, "BATCH-SYNTH-01", "production")
    ).toBe(0);
  });

  it("warns before a send run rather than after it", () => {
    const source = readScript("Sending.gs");
    expect(source).toContain("unexportedAttemptsForActiveBatch_");
    // The check sits inside sendRows_, before the row loop begins.
    const checkAt = source.indexOf("unexportedAttemptsForActiveBatch_(");
    const loopAt = source.indexOf("for (var i = 0; i < rowNumbers.length");
    expect(checkAt).toBeGreaterThan(-1);
    expect(checkAt).toBeLessThan(loopAt);
  });
});

describe("CHECKIN-10A Apps Script menu and gates", () => {
  it("offers the five-recipient pilot and the capped normal run", () => {
    const code = readScript("Code.gs");
    expect(code).toContain("Send 5-Recipient Production Pilot");
    expect(code).toContain("sendProductionPilot");
    expect(code).toContain("Send Next 25");
  });

  it("checks the workbook mode when loading a queue and again when sending", () => {
    expect(readScript("Validation.gs")).toContain("queueModeAllowedInWorkbook_");
    expect(readScript("Sending.gs")).toContain("queueModeAllowedInWorkbook_");
    expect(readScript("Sending.gs")).toContain("eventAllowedInWorkbook_");
  });

  it("confirms production with the active batch code inside the lock", () => {
    const source = readScript("Sending.gs");
    const lockAt = source.indexOf("LockService.getScriptLock");
    // The call site, not the function definition: the definition ends in "{".
    const confirmAt = source.indexOf(
      "assertProductionUnlocked_(config, activeBatchCode);"
    );
    expect(lockAt).toBeGreaterThan(-1);
    expect(confirmAt).toBeGreaterThan(lockAt);
    // And it must run before any row is processed.
    const loopAt = source.indexOf("for (var i = 0; i < rowNumbers.length");
    expect(confirmAt).toBeLessThan(loopAt);
  });

  it("still sends no email from an export action", () => {
    const results = readScript("Results.gs");
    expect(results).not.toContain("MailApp.sendEmail");
    expect(results).not.toContain("GmailApp.sendEmail");
  });

  it("installs no automatic trigger for the new pilot action", () => {
    for (const file of ["Code.gs", "Sending.gs"]) {
      expect(readScript(file), file).not.toContain("ScriptApp.newTrigger");
    }
  });
});

describe("CHECKIN-10A administrator runbook", () => {
  it("covers all eighteen required sections in order", () => {
    expect(RUNBOOK_SECTIONS).toHaveLength(18);
    const titles = RUNBOOK_SECTIONS.map((section) => section.title);
    expect(titles[0]).toBe("Test workbook setup");
    expect(titles[1]).toBe("Production workbook setup");
    expect(titles[2]).toBe("Creating the production event");
    expect(titles[3]).toBe("Importing registrations");
    expect(titles[4]).toBe("Registration reconciliation");
    expect(titles[5]).toBe("Generating PDFs");
    expect(titles[6]).toBe("Internal test workflow");
    expect(titles[7]).toBe("Preparing the production batch");
    expect(titles[8]).toBe(`${PRODUCTION_PILOT_RUN_SIZE}-recipient pilot`);
    expect(titles[9]).toBe(`Sending the next ${PRODUCTION_NORMAL_RUN_SIZE}`);
    expect(titles[10]).toBe("Exporting and importing results");
    expect(titles[11]).toBe("Interrupted-run recovery");
    expect(titles[12]).toBe("Failed-delivery retry");
    expect(titles[13]).toBe("Resend versus replacement");
    expect(titles[14]).toBe("Recording a prior external delivery");
    expect(titles[15]).toBe("Bounce review");
    expect(titles[16]).toBe("Completion checklist");
    expect(titles[17]).toBe("Emergency stop procedure");
  });

  it("gives every section actionable steps", () => {
    for (const section of RUNBOOK_SECTIONS) {
      expect(section.steps.length, section.title).toBeGreaterThan(0);
      for (const step of section.steps) {
        expect(step.trim().length, section.title).toBeGreaterThan(0);
      }
    }
  });

  it("states both workbook banners so an administrator can check them", () => {
    const all = JSON.stringify(RUNBOOK_SECTIONS);
    expect(all).toContain("TEST WORKBOOK");
    expect(all).toContain("PRODUCTION WORKBOOK");
  });

  it("explains resend versus replacement in the agreed wording", () => {
    const section = RUNBOOK_SECTIONS.find(
      (entry) => entry.title === "Resend versus replacement"
    );
    expect(section?.intro).toBe(RESEND_VS_REPLACEMENT_TEXT);
  });

  it("contains no secret, token or service-role material", () => {
    const all = JSON.stringify(RUNBOOK_SECTIONS).toLowerCase();
    for (const forbidden of [
      "service_role",
      "signing_secret",
      "ticket_distribution_secret",
      "token_hash",
      "eyj", // a JWT prefix
    ]) {
      expect(all, forbidden).not.toContain(forbidden);
    }
  });

  it("uses commands that actually exist for the production event", () => {
    const section = RUNBOOK_SECTIONS.find(
      (entry) => entry.title === "Creating the production event"
    );
    const steps = (section?.steps ?? []).join(" ");
    expect(steps).toContain("events:create-production");
    expect(steps).toContain("events:verify-production");
    expect(steps).toContain("CONVOCATION-2026");
  });
});

describe("CHECKIN-10A production surfaces", () => {
  it("shows the eligibility preview and progress panel on the production page", () => {
    const page = readSource("app/admin/tickets/distribution/production/page.tsx");
    expect(page).toContain("Production eligibility preview");
    expect(page).toContain("Production progress");
    expect(page).toContain("unimported-results-warning");
    expect(page).toContain("Record previous external delivery");
  });

  it("shows the deployment and event banner on every administrator page", () => {
    const layout = readSource("app/admin/layout.tsx");
    expect(layout).toContain("EnvironmentBanner");
    expect(layout).toContain("resolveProductionGateStatus");
  });

  it("never sends email from the external delivery route", () => {
    const route = readSource(
      "app/api/admin/tickets/distribution/external-deliveries/route.ts"
    );
    expect(route.toLowerCase()).not.toContain("sendmail");
    expect(route.toLowerCase()).not.toContain("nodemailer");
    expect(route).not.toContain("delivery_attempts");
  });

  it("gates production preparation and queue export on the server", () => {
    const prepare = readSource(
      "app/api/admin/tickets/distribution/batches/route.ts"
    );
    const queue = readSource(
      "app/api/admin/tickets/distribution/batches/[batchId]/send-queue/route.ts"
    );
    expect(prepare).toContain("resolveModeGate");
    expect(queue).toContain("resolveModeGate");
  });
});
