/**
 * CHECKIN-10A workbook modes, production confirmation and safe run sizes.
 *
 * The pure guards from Config.gs and Sending.gs are executed in a Node VM
 * with no Sheet, Mail or Drive API present, so no email can be sent by these
 * tests and none of the mocked values touch a real account. All addresses and
 * batch codes here are synthetic.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

const scriptDir = fileURLToPath(
  new URL("../../../google-apps-script/graduation-ticket-sender", import.meta.url)
);

interface Decision {
  allowed: boolean;
  message: string;
}

interface Sandbox {
  WORKBOOK_MODES: { TEST: string; PRODUCTION: string };
  WORKBOOK_BANNERS: { TEST: string; PRODUCTION: string };
  PRODUCTION_EVENT_CODE: string;
  PRODUCTION_PILOT_RUN_SIZE: number;
  PRODUCTION_NORMAL_RUN_SIZE: number;
  workbookMode_: (config: Record<string, string>) => string;
  isProductionWorkbook_: (config: Record<string, string>) => boolean;
  workbookBanner_: (config: Record<string, string>) => string;
  assertWorkbookModeConsistent_: (config: Record<string, string>) => void;
  queueModeAllowedInWorkbook_: (wb: string, queue: string) => Decision;
  eventAllowedInWorkbook_: (wb: string, eventCode: string) => Decision;
  productionConfirmationDecision_: (typed: string, active: string) => Decision;
  maxPerRun_: (config: Record<string, string>) => number;
  isTestMode_: (config: Record<string, string>) => boolean;
  runCap_: (config: Record<string, string>, limit?: number) => number;
  readyRowNumbers_: (
    rows: Array<{ status: string; __rowNumber: number }>
  ) => number[];
}

/**
 * Config.gs and the pure helpers of Sending.gs share one context. Sending.gs
 * is loaded only for its pure functions; nothing in it runs at load time.
 */
function loadScripts(): Sandbox {
  const sandbox: Record<string, unknown> = {};
  const context = createContext(sandbox);
  runInContext(readFileSync(join(scriptDir, "Config.gs"), "utf8"), context);
  runInContext(readFileSync(join(scriptDir, "Sending.gs"), "utf8"), context);
  return sandbox as unknown as Sandbox;
}

const gs = loadScripts();

const TEST_WORKBOOK = {
  WORKBOOK_MODE: "TEST",
  TEST_MODE: "TRUE",
  TEST_RECIPIENT_EMAIL: "internal.admin@example.test",
  MAX_PER_RUN: "1",
  PRODUCTION_CONFIRMATION: "",
};

const PRODUCTION_WORKBOOK = {
  WORKBOOK_MODE: "PRODUCTION",
  TEST_MODE: "FALSE",
  TEST_RECIPIENT_EMAIL: "",
  MAX_PER_RUN: "25",
  PRODUCTION_CONFIRMATION: "",
};

describe("CHECKIN-10A workbook modes", () => {
  it("declares both workbook modes with distinct banners", () => {
    expect(gs.workbookBanner_(TEST_WORKBOOK)).toBe(
      "TEST WORKBOOK — all messages are redirected to the internal test recipient."
    );
    expect(gs.workbookBanner_(PRODUCTION_WORKBOOK)).toBe(
      "PRODUCTION WORKBOOK — messages are delivered to graduate email addresses."
    );
  });

  it("fails closed to TEST for a missing or misspelled workbook mode", () => {
    expect(gs.workbookMode_({})).toBe("TEST");
    expect(gs.workbookMode_({ WORKBOOK_MODE: "" })).toBe("TEST");
    expect(gs.workbookMode_({ WORKBOOK_MODE: "PRODCUTION" })).toBe("TEST");
    expect(gs.workbookMode_({ WORKBOOK_MODE: "prod" })).toBe("TEST");
    // Only the exact word, case-insensitively, means production.
    expect(gs.workbookMode_({ WORKBOOK_MODE: "production" })).toBe("PRODUCTION");
  });

  it("refuses a production workbook left in test mode", () => {
    expect(() =>
      gs.assertWorkbookModeConsistent_({
        ...PRODUCTION_WORKBOOK,
        TEST_MODE: "TRUE",
      })
    ).toThrow(/WORKBOOK_MODE is PRODUCTION but TEST_MODE is TRUE/);
  });

  it("refuses a test workbook with test mode switched off", () => {
    expect(() =>
      gs.assertWorkbookModeConsistent_({ ...TEST_WORKBOOK, TEST_MODE: "FALSE" })
    ).toThrow(/must\s+never send to a graduate/);
  });

  it("accepts each workbook in its own consistent configuration", () => {
    expect(() => gs.assertWorkbookModeConsistent_(TEST_WORKBOOK)).not.toThrow();
    expect(() =>
      gs.assertWorkbookModeConsistent_(PRODUCTION_WORKBOOK)
    ).not.toThrow();
  });
});

describe("CHECKIN-10A queue rejection between workbooks", () => {
  it("test workbook rejects a production queue", () => {
    const decision = gs.queueModeAllowedInWorkbook_("TEST", "production");
    expect(decision.allowed).toBe(false);
    expect(decision.message).toMatch(/TEST workbook/);
    expect(decision.message).toMatch(/PRODUCTION queue/);
  });

  it("production workbook rejects a test queue", () => {
    const decision = gs.queueModeAllowedInWorkbook_("PRODUCTION", "test");
    expect(decision.allowed).toBe(false);
    expect(decision.message).toMatch(/PRODUCTION workbook/);
    expect(decision.message).toMatch(/TEST queue/);
  });

  it("accepts each queue in its own workbook", () => {
    expect(gs.queueModeAllowedInWorkbook_("TEST", "test").allowed).toBe(true);
    expect(
      gs.queueModeAllowedInWorkbook_("PRODUCTION", "production").allowed
    ).toBe(true);
  });

  it("rejects a queue that declares no recognised mode", () => {
    for (const mode of ["", "staging", "PROD"]) {
      expect(
        gs.queueModeAllowedInWorkbook_("PRODUCTION", mode).allowed,
        mode
      ).toBe(false);
    }
  });

  it("treats an unrecognised workbook mode as TEST, so it still rejects production", () => {
    expect(gs.queueModeAllowedInWorkbook_("", "production").allowed).toBe(false);
    expect(gs.queueModeAllowedInWorkbook_("nonsense", "production").allowed).toBe(
      false
    );
  });

  it("production workbook sends only for CONVOCATION-2026", () => {
    expect(gs.PRODUCTION_EVENT_CODE).toBe("CONVOCATION-2026");
    expect(
      gs.eventAllowedInWorkbook_("PRODUCTION", "CONVOCATION-2026").allowed
    ).toBe(true);
    expect(
      gs.eventAllowedInWorkbook_("PRODUCTION", "GRAD-2026-DEV").allowed
    ).toBe(false);
    expect(gs.eventAllowedInWorkbook_("PRODUCTION", "").allowed).toBe(false);
  });
});

describe("CHECKIN-10A production confirmation", () => {
  it("requires the exact active batch code", () => {
    expect(
      gs.productionConfirmationDecision_("BATCH-SYNTH-01", "BATCH-SYNTH-01")
        .allowed
    ).toBe(true);
  });

  it("rejects a different batch code", () => {
    const decision = gs.productionConfirmationDecision_(
      "BATCH-SYNTH-02",
      "BATCH-SYNTH-01"
    );
    expect(decision.allowed).toBe(false);
    expect(decision.message).toMatch(/BATCH-SYNTH-01/);
  });

  it("rejects a near miss in case or whitespace padding beyond trimming", () => {
    expect(
      gs.productionConfirmationDecision_("batch-synth-01", "BATCH-SYNTH-01")
        .allowed
    ).toBe(false);
    expect(
      gs.productionConfirmationDecision_("BATCH SYNTH 01", "BATCH-SYNTH-01")
        .allowed
    ).toBe(false);
    // Surrounding whitespace only is forgiven, since it is a paste artefact.
    expect(
      gs.productionConfirmationDecision_("  BATCH-SYNTH-01  ", "BATCH-SYNTH-01")
        .allowed
    ).toBe(true);
  });

  it("rejects an empty confirmation", () => {
    const decision = gs.productionConfirmationDecision_("", "BATCH-SYNTH-01");
    expect(decision.allowed).toBe(false);
    expect(decision.message).toMatch(/locked/);
  });

  it("refuses when no batch is loaded, so there is nothing to confirm", () => {
    const decision = gs.productionConfirmationDecision_("anything", "");
    expect(decision.allowed).toBe(false);
    expect(decision.message).toMatch(/No active batch is loaded/);
  });
});

describe("CHECKIN-10A safe run sizes", () => {
  it("caps a normal run at twenty-five", () => {
    expect(gs.PRODUCTION_NORMAL_RUN_SIZE).toBe(25);
    expect(gs.maxPerRun_({ MAX_PER_RUN: "25" })).toBe(25);
  });

  it("refuses to let the Configuration tab raise the cap above twenty-five", () => {
    // The ceiling lives in code, not in the sheet, so an administrator cannot
    // type their way into a larger run.
    expect(gs.maxPerRun_({ MAX_PER_RUN: "500" })).toBe(25);
    expect(gs.maxPerRun_({ MAX_PER_RUN: "100" })).toBe(25);
  });

  it("lets the Configuration tab lower the cap", () => {
    expect(gs.maxPerRun_({ MAX_PER_RUN: "1" })).toBe(1);
    expect(gs.maxPerRun_(TEST_WORKBOOK)).toBe(1);
  });

  it("falls back to the ceiling for a missing or invalid cap", () => {
    expect(gs.maxPerRun_({})).toBe(25);
    expect(gs.maxPerRun_({ MAX_PER_RUN: "abc" })).toBe(25);
    expect(gs.maxPerRun_({ MAX_PER_RUN: "0" })).toBe(25);
    expect(gs.maxPerRun_({ MAX_PER_RUN: "-5" })).toBe(25);
  });

  it("caps the pilot at five", () => {
    expect(gs.PRODUCTION_PILOT_RUN_SIZE).toBe(5);
    expect(gs.runCap_(PRODUCTION_WORKBOOK, gs.PRODUCTION_PILOT_RUN_SIZE)).toBe(5);
  });

  it("never lets a run limit raise the configured cap", () => {
    expect(gs.runCap_({ MAX_PER_RUN: "1" }, 25)).toBe(1);
    expect(gs.runCap_({ MAX_PER_RUN: "25" }, 1000)).toBe(25);
  });

  it("uses the configured cap when no run limit is given", () => {
    expect(gs.runCap_(PRODUCTION_WORKBOOK)).toBe(25);
    expect(gs.runCap_(PRODUCTION_WORKBOOK, 0)).toBe(25);
  });
});

describe("CHECKIN-10A interrupted-run recovery", () => {
  function queueRows(sentCount: number, total: number) {
    const rows = [];
    for (let i = 0; i < total; i += 1) {
      rows.push({
        status: i < sentCount ? "SENT" : "READY",
        __rowNumber: i + 2,
      });
    }
    return rows;
  }

  it("selects only READY rows, so successful rows are never resent", () => {
    // A 25-row run that stopped after 17 sends leaves 8 eligible rows.
    const rows = queueRows(17, 25);
    const remaining = gs.readyRowNumbers_(rows);
    expect(remaining).toHaveLength(8);
    expect(remaining[0]).toBe(19);
  });

  it("skips every terminal status, not only SENT", () => {
    const rows = [
      { status: "SENT", __rowNumber: 2 },
      { status: "TEST_SENT", __rowNumber: 3 },
      { status: "SENDING", __rowNumber: 4 },
      { status: "FAILED", __rowNumber: 5 },
      { status: "READY", __rowNumber: 6 },
    ];
    // Only READY is picked up by a normal run. FAILED is reached deliberately
    // through Resume Failed, never by rerunning a normal send.
    expect(gs.readyRowNumbers_(rows)).toEqual([6]);
  });

  it("returns nothing once every row has been sent", () => {
    expect(gs.readyRowNumbers_(queueRows(25, 25))).toEqual([]);
  });

  it("sends at most five in a pilot even when many rows remain", () => {
    const remaining = gs.readyRowNumbers_(queueRows(0, 40));
    const pilot = remaining.slice(0, gs.PRODUCTION_PILOT_RUN_SIZE);
    expect(pilot).toHaveLength(5);
  });

  it("sends only what remains when fewer than five are left", () => {
    const remaining = gs.readyRowNumbers_(queueRows(38, 40));
    expect(remaining.slice(0, gs.PRODUCTION_PILOT_RUN_SIZE)).toHaveLength(2);
  });
});
