/**
 * Active-batch queue isolation for the Apps Script loader.
 *
 * Loads the pure isolation and replacement functions from Validation.gs into a
 * Node VM (no Sheet, no Mail API) and proves a queue must describe exactly one
 * batch, one event and one mode, and that replacing an active queue that still
 * has unsent rows requires an explicit archive-and-replace.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

const scriptDir = fileURLToPath(
  new URL("../../../google-apps-script/graduation-ticket-sender", import.meta.url)
);

interface IsolationResult {
  ok: boolean;
  error: string;
  batchCode: string;
  eventCode: string;
  mode: string;
}

interface ReplacementDecision {
  allowed: boolean;
  requiresArchive: boolean;
  message: string;
}

function loadValidation(): {
  evaluateQueueIsolation_: (rows: Array<{ values: string[] }>) => IsolationResult;
  queueReplacementDecision_: (
    active: string,
    hasUnsent: boolean,
    incoming: string,
    force: boolean
  ) => ReplacementDecision;
  SEND_QUEUE_HEADERS: string[];
} {
  const source = readFileSync(join(scriptDir, "Validation.gs"), "utf8");
  const sandbox: Record<string, unknown> = {};
  runInContext(source, createContext(sandbox));
  return sandbox as never;
}

/** Builds a 21-column queue row with the given batch/event/mode. */
function queueRow(
  batchCode: string,
  eventCode: string,
  mode: string
): { values: string[] } {
  const { SEND_QUEUE_HEADERS } = loadValidation();
  const values = SEND_QUEUE_HEADERS.map(() => "x");
  values[SEND_QUEUE_HEADERS.indexOf("delivery_batch_code")] = batchCode;
  values[SEND_QUEUE_HEADERS.indexOf("event_code")] = eventCode;
  values[SEND_QUEUE_HEADERS.indexOf("delivery_mode")] = mode;
  return { values };
}

describe("evaluateQueueIsolation_", () => {
  it("accepts a single-batch, single-event, single-mode queue", () => {
    const { evaluateQueueIsolation_ } = loadValidation();
    const result = evaluateQueueIsolation_([
      queueRow("DLV-2026-AAAA", "GRAD-2026-DEV", "test"),
      queueRow("DLV-2026-AAAA", "GRAD-2026-DEV", "test"),
    ]);
    expect(result.ok).toBe(true);
    expect(result.batchCode).toBe("DLV-2026-AAAA");
    expect(result.eventCode).toBe("GRAD-2026-DEV");
    expect(result.mode).toBe("test");
  });

  it("rejects mixed batch codes", () => {
    const { evaluateQueueIsolation_ } = loadValidation();
    const result = evaluateQueueIsolation_([
      queueRow("DLV-2026-AAAA", "GRAD-2026-DEV", "test"),
      queueRow("DLV-2026-BBBB", "GRAD-2026-DEV", "test"),
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("batch");
  });

  it("rejects mixed event codes", () => {
    const { evaluateQueueIsolation_ } = loadValidation();
    const result = evaluateQueueIsolation_([
      queueRow("DLV-2026-AAAA", "GRAD-2026-DEV", "test"),
      queueRow("DLV-2026-AAAA", "CONVOCATION-2026", "test"),
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("event");
  });

  it("rejects mixed delivery modes", () => {
    const { evaluateQueueIsolation_ } = loadValidation();
    const result = evaluateQueueIsolation_([
      queueRow("DLV-2026-AAAA", "GRAD-2026-DEV", "test"),
      queueRow("DLV-2026-AAAA", "GRAD-2026-DEV", "production"),
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("mode");
  });

  it("rejects an empty queue", () => {
    const { evaluateQueueIsolation_ } = loadValidation();
    expect(evaluateQueueIsolation_([]).ok).toBe(false);
  });
});

describe("queueReplacementDecision_", () => {
  it("allows loading when nothing is active", () => {
    const { queueReplacementDecision_ } = loadValidation();
    expect(
      queueReplacementDecision_("", true, "DLV-2026-AAAA", false).allowed
    ).toBe(true);
  });

  it("allows reloading the same active batch", () => {
    const { queueReplacementDecision_ } = loadValidation();
    expect(
      queueReplacementDecision_("DLV-2026-AAAA", true, "DLV-2026-AAAA", false)
        .allowed
    ).toBe(true);
  });

  it("blocks replacing an active batch that has unsent rows without archive", () => {
    const { queueReplacementDecision_ } = loadValidation();
    const decision = queueReplacementDecision_(
      "DLV-2026-AAAA",
      true,
      "DLV-2026-BBBB",
      false
    );
    expect(decision.allowed).toBe(false);
    expect(decision.requiresArchive).toBe(true);
  });

  it("allows the replacement once archive is explicit", () => {
    const { queueReplacementDecision_ } = loadValidation();
    expect(
      queueReplacementDecision_("DLV-2026-AAAA", true, "DLV-2026-BBBB", true)
        .allowed
    ).toBe(true);
  });

  it("allows replacement when the active batch has no unsent rows", () => {
    const { queueReplacementDecision_ } = loadValidation();
    expect(
      queueReplacementDecision_("DLV-2026-AAAA", false, "DLV-2026-BBBB", false)
        .allowed
    ).toBe(true);
  });
});
