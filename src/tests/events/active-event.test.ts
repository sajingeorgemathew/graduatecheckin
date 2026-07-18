import { describe, expect, it } from "vitest";

import {
  ACTIVE_EVENT_FAILURE_MESSAGES,
  evaluateActiveEvent,
} from "@/features/events/active-event";
import type { GraduationEventRow } from "@/types/database";

function event(overrides: Partial<GraduationEventRow> = {}): GraduationEventRow {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    event_code: "GRAD-2026-DEV",
    event_name: "Test Graduation 2026",
    starts_at: "2026-08-01T17:00:00Z",
    ends_at: null,
    timezone: "America/Toronto",
    venue_name: "Test Hall",
    venue_address: "1 Fictional Street, Toronto",
    status: "active",
    is_test: true,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("active event evaluation", () => {
  it("accepts an open configured event", () => {
    const row = event();
    expect(evaluateActiveEvent("GRAD-2026-DEV", row)).toEqual({
      ok: true,
      event: row,
    });
  });

  it("accepts a draft event for preparation work", () => {
    const row = event({ status: "draft" });
    expect(evaluateActiveEvent("GRAD-2026-DEV", row).ok).toBe(true);
  });

  it("rejects a missing configuration value", () => {
    expect(evaluateActiveEvent("", event())).toEqual({
      ok: false,
      code: "event_code_not_configured",
    });
    expect(evaluateActiveEvent("   ", null)).toEqual({
      ok: false,
      code: "event_code_not_configured",
    });
  });

  it("rejects an event that does not exist", () => {
    expect(evaluateActiveEvent("GRAD-2026-DEV", null)).toEqual({
      ok: false,
      code: "event_not_found",
    });
  });

  it("rejects closed and archived events", () => {
    expect(evaluateActiveEvent("GRAD-2026-DEV", event({ status: "closed" }))).toEqual(
      { ok: false, code: "event_not_open" }
    );
    expect(
      evaluateActiveEvent("GRAD-2026-DEV", event({ status: "archived" }))
    ).toEqual({ ok: false, code: "event_not_open" });
  });

  it("provides a safe message for every failure code", () => {
    for (const message of Object.values(ACTIVE_EVENT_FAILURE_MESSAGES)) {
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toContain("SUPABASE");
    }
  });
});
