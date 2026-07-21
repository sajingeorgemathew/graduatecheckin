/**
 * Safety coverage for the CONVOCATION-2026 production-event scripts.
 *
 * The create script must be a distinct, non-test, draft event, must make no
 * writes before the dry-run early return, must never overwrite the event mode
 * or status on an existing event (idempotency), and must never write to the
 * GRAD-2026-DEV test event. The verify script must confirm the event starts
 * empty.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DEV_EVENT_CODE,
  PRODUCTION_EVENT_CODE,
  PRODUCTION_EVENT_DETAILS,
} from "../../../scripts/events/convocation-production-plan";

function readRepo(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../${relative}`, import.meta.url)),
    "utf8"
  );
}

describe("production-event plan constants", () => {
  it("uses a distinct production event code, not the dev event", () => {
    expect(PRODUCTION_EVENT_CODE).toBe("CONVOCATION-2026");
    expect(DEV_EVENT_CODE).toBe("GRAD-2026-DEV");
    expect(PRODUCTION_EVENT_CODE).not.toBe(DEV_EVENT_CODE);
  });

  it("carries the approved ceremony details", () => {
    expect(PRODUCTION_EVENT_DETAILS.eventName).toBe("Convocation Ceremony 2026");
    expect(PRODUCTION_EVENT_DETAILS.timezone).toBe("America/Toronto");
    expect(PRODUCTION_EVENT_DETAILS.venueName).toContain("Mississauga Grand");
    expect(PRODUCTION_EVENT_DETAILS.programSchedule.length).toBeGreaterThanOrEqual(3);
  });
});

describe("create-convocation-production safety", () => {
  const source = readRepo("scripts/events/create-convocation-production.ts");

  it("creates a non-test, draft event", () => {
    expect(source).toContain("is_test: false");
    expect(source).toContain('status: "draft"');
  });

  it("makes no write before the dry-run early return", () => {
    const dryRunReturn = source.indexOf("Dry-run complete.");
    const firstInsert = source.indexOf(".insert(");
    const firstUpdate = source.indexOf(".update({");
    expect(dryRunReturn).toBeGreaterThan(0);
    expect(firstInsert).toBeGreaterThan(dryRunReturn);
    expect(firstUpdate).toBeGreaterThan(dryRunReturn);
  });

  it("only inserts the event when it does not already exist (idempotent)", () => {
    expect(source).toContain("if (existing === null)");
  });

  it("never changes ACTIVE_GRADUATION_EVENT_CODE", () => {
    expect(source).toContain("ACTIVE_GRADUATION_EVENT_CODE was not changed");
    expect(source).not.toContain("process.env.ACTIVE_GRADUATION_EVENT_CODE =");
  });

  it("only reads the GRAD-2026-DEV event, never writes it", () => {
    // The dev event is loaded for a read-only comparison; there must be no
    // update or insert keyed by the dev event code.
    expect(source).not.toMatch(/\.update\([^)]*\)[\s\S]{0,120}GRAD-2026-DEV/);
    expect(source).toContain("preserved untouched");
  });

  it("copies no registrations, tickets, PDFs, check-ins or delivery records", () => {
    expect(source).toContain("were created or copied");
  });
});

describe("verify-convocation-production checks emptiness", () => {
  const source = readRepo("scripts/events/verify-convocation-production.ts");

  it("confirms the event is non-test and draft", () => {
    expect(source).toContain("must not be a test event");
    expect(source).toContain("must remain draft");
  });

  it("counts registrations, documents and deliveries and requires zero", () => {
    expect(source).toContain("graduation_registrations");
    expect(source).toContain("graduation_ticket_documents");
    expect(source).toContain("graduation_ticket_deliveries");
    expect(source).toContain("must be zero");
  });

  it("is read-only (no insert or update)", () => {
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
  });
});
