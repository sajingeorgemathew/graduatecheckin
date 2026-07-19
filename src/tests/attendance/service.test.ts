import { describe, expect, it } from "vitest";

import {
  createRegistrationReference,
} from "@/features/attendance/action-token";
import {
  loadDetail,
  loadSummary,
  searchRegistrations,
} from "@/features/attendance/service";
import type {
  ActivityRecord,
  CheckinRecord,
  RegistrationRecord,
} from "@/features/attendance/repository";
import {
  EVENT_CODE,
  REGISTRATION_ID,
  TEST_SECRET,
  fakeDeps,
  fictionalSession,
} from "./helpers";

function registration(
  overrides: Partial<RegistrationRecord> = {}
): RegistrationRecord {
  return {
    id: REGISTRATION_ID,
    graduateFullName: "Avery Fictional",
    registrationStatus: "eligible",
    registeredAdultGuests: 2,
    registeredChildren0To4: 1,
    registeredChildren5To10: 1,
    isTest: false,
    ...overrides,
  };
}

describe("loadSummary authorization", () => {
  it("denies a scanner session with 403 and no database call", async () => {
    let called = false;
    const deps = fakeDeps({
      repo: {
        listEligibleRegistrations: async () => {
          called = true;
          return [];
        },
      },
    });
    const outcome = await loadSummary(deps, fictionalSession("scanner"));
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(403);
    }
    expect(called).toBe(false);
  });

  it("denies an inactive supervisor", async () => {
    const outcome = await loadSummary(
      fakeDeps(),
      fictionalSession("supervisor", { isActive: false })
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(403);
    }
  });

  it("allows supervisor and administrator", async () => {
    for (const role of ["supervisor", "administrator"] as const) {
      const outcome = await loadSummary(fakeDeps(), fictionalSession(role));
      expect(outcome.kind, role).toBe("result");
    }
  });

  it("returns a 503 when no active event resolves", async () => {
    const outcome = await loadSummary(
      fakeDeps({ event: { ok: false, code: "event_not_open" } }),
      fictionalSession()
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(503);
    }
  });
});

describe("loadSummary aggregation and privacy", () => {
  const activity: ActivityRecord = {
    id: "00000000-0000-4000-8000-0000000000f1",
    registrationId: REGISTRATION_ID,
    createdAt: "2026-08-01T17:05:00.000Z",
    entryKind: "manual_arrival",
    action: "admission",
    graduateDelta: 1,
    adultGuestDelta: 0,
    child0To4Delta: 0,
    child5To10Delta: 0,
    reason: "Ticket unavailable",
    recordedBy: "00000000-0000-4000-8000-0000000000c9",
    staffUserId: "00000000-0000-4000-8000-0000000000c9",
    reversesCheckinId: null,
    graduateFullName: "Avery Fictional",
  };

  it("aggregates eligible registrations and maps staff names", async () => {
    const deps = fakeDeps({
      repo: {
        listEligibleRegistrations: async () => [registration()],
        listEligibleDeltasByRegistration: async () =>
          new Map([
            [
              REGISTRATION_ID,
              [
                {
                  graduate_delta: 1,
                  adult_guest_delta: 0,
                  child_0_4_delta: 0,
                  child_5_10_delta: 0,
                },
              ],
            ],
          ]),
        listRecentActivity: async () => [activity],
        resolveStaffDisplayNames: async () =>
          new Map([[activity.recordedBy ?? "", "Fictional Supervisor"]]),
      },
    });
    const outcome = await loadSummary(deps, fictionalSession());
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.eligibleRegistrations).toBe(1);
      expect(outcome.view.graduatesArrived).toBe(1);
      expect(outcome.view.recentActivity[0].recordedByName).toBe(
        "Fictional Supervisor"
      );
      const serialized = JSON.stringify(outcome.view);
      expect(serialized).not.toContain("@example.com");
      expect(serialized).not.toContain(REGISTRATION_ID);
    }
  });
});

describe("searchRegistrations", () => {
  it("rejects a too-short name search with 422", async () => {
    const outcome = await searchRegistrations(fakeDeps(), fictionalSession(), {
      field: "name",
      term: "a",
    });
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(422);
    }
  });

  it("returns a signed registration reference and never a UUID", async () => {
    const deps = fakeDeps({
      repo: {
        searchRegistrationsByName: async () => [registration()],
      },
    });
    const outcome = await searchRegistrations(deps, fictionalSession(), {
      field: "name",
      term: "Avery",
    });
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.results).toHaveLength(1);
      const result = outcome.view.results[0];
      expect(result.registrationReference.startsWith("ra1.")).toBe(true);
      expect(JSON.stringify(result)).not.toContain(REGISTRATION_ID);
    }
  });

  it("returns no results for an invalid ticket-code format", async () => {
    let searched = false;
    const deps = fakeDeps({
      repo: {
        findRegistrationByTicketCode: async () => {
          searched = true;
          return registration();
        },
      },
    });
    const outcome = await searchRegistrations(deps, fictionalSession(), {
      field: "ticket_code",
      term: "not-a-code",
    });
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.results).toHaveLength(0);
    }
    expect(searched).toBe(false);
  });
});

describe("searchRegistrations filters", () => {
  const REG_A = "00000000-0000-4000-8000-0000000000a1";
  const REG_B = "00000000-0000-4000-8000-0000000000a2";

  // Reg A: eligible, production, no arrivals, no ticket.
  const regA = registration({ id: REG_A, isTest: false });
  // Reg B: eligible, test, fully arrived, active ticket.
  const regB = registration({ id: REG_B, isTest: true });

  const fullDeltas = new Map([
    [
      REG_B,
      [
        {
          graduate_delta: 1,
          adult_guest_delta: 2,
          child_0_4_delta: 1,
          child_5_10_delta: 1,
        },
      ],
    ],
  ]);

  function depsFor(overrides = {}) {
    return fakeDeps({
      repo: {
        searchRegistrationsByName: async () => [regA, regB],
        listRegistrations: async () => [regA, regB],
        listDeltasForRegistrations: async () => fullDeltas,
        currentTicketStatusByRegistration: async () =>
          new Map([[REG_B, "active"]]),
        ...overrides,
      },
    });
  }

  it("filters by attendance status server-side", async () => {
    const outcome = await searchRegistrations(depsFor(), fictionalSession(), {
      field: "name",
      term: "avery",
      filters: { attendanceStatus: "complete" },
    });
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.results).toHaveLength(1);
      expect(outcome.view.results[0].classification).toBe("complete");
    }
  });

  it("filters by ticket status, including no active ticket", async () => {
    const active = await searchRegistrations(depsFor(), fictionalSession(), {
      field: "name",
      term: "avery",
      filters: { ticketStatus: "active" },
    });
    expect(active.kind).toBe("result");
    if (active.kind === "result") {
      expect(active.view.results).toHaveLength(1);
      expect(active.view.results[0].ticketStatus).toBe("active");
    }

    const none = await searchRegistrations(depsFor(), fictionalSession(), {
      field: "name",
      term: "avery",
      filters: { ticketStatus: "none" },
    });
    expect(none.kind).toBe("result");
    if (none.kind === "result") {
      expect(none.view.results).toHaveLength(1);
      expect(none.view.results[0].ticketStatus).toBeNull();
    }
  });

  it("filters by environment", async () => {
    const production = await searchRegistrations(
      depsFor(),
      fictionalSession(),
      { field: "name", term: "avery", filters: { environment: "production" } }
    );
    expect(production.kind).toBe("result");
    if (production.kind === "result") {
      expect(production.view.results).toHaveLength(1);
    }
  });

  it("browses signed-up registrations by filter with no term", async () => {
    const outcome = await searchRegistrations(depsFor(), fictionalSession(), {
      field: "name",
      term: "",
      filters: { rsvpStatus: "signed_up" },
    });
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      // Signed up returns the existing RSVP registrations, never a fabricated
      // not-signed-up list.
      expect(outcome.view.matched).toBe(2);
      expect(outcome.view.results).toHaveLength(2);
    }
  });

  it("returns no results and never browses for an empty term with default filters", async () => {
    let browsed = false;
    const deps = depsFor({
      listRegistrations: async () => {
        browsed = true;
        return [regA, regB];
      },
    });
    const outcome = await searchRegistrations(deps, fictionalSession(), {
      field: "name",
      term: "",
    });
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.results).toHaveLength(0);
      expect(outcome.view.matched).toBe(0);
    }
    expect(browsed).toBe(false);
  });

  it("combines a search term with a filter", async () => {
    const outcome = await searchRegistrations(depsFor(), fictionalSession(), {
      field: "name",
      term: "avery",
      filters: { attendanceStatus: "not_arrived" },
    });
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.results).toHaveLength(1);
      expect(outcome.view.results[0].classification).toBe("not_arrived");
    }
  });

  it("caps results at 25 and reports the matched total", async () => {
    const many = Array.from({ length: 40 }, (_unused, index) =>
      registration({
        id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
      })
    );
    const deps = fakeDeps({
      repo: {
        searchRegistrationsByName: async () => many,
        listDeltasForRegistrations: async () => new Map(),
        currentTicketStatusByRegistration: async () => new Map(),
      },
    });
    const outcome = await searchRegistrations(deps, fictionalSession(), {
      field: "name",
      term: "avery",
    });
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.results).toHaveLength(25);
      expect(outcome.view.matched).toBe(40);
      expect(outcome.view.truncated).toBe(true);
    }
  });
});

describe("loadDetail", () => {
  const checkin: CheckinRecord = {
    id: "00000000-0000-4000-8000-0000000000b1",
    registrationId: REGISTRATION_ID,
    createdAt: "2026-08-01T17:05:00.000Z",
    entryKind: "manual_arrival",
    action: "admission",
    graduateDelta: 1,
    adultGuestDelta: 0,
    child0To4Delta: 0,
    child5To10Delta: 0,
    reason: "Ticket unavailable",
    recordedBy: "00000000-0000-4000-8000-0000000000c9",
    staffUserId: "00000000-0000-4000-8000-0000000000c9",
    reversesCheckinId: null,
  };

  it("rejects an invalid registration reference with 400", async () => {
    const outcome = await loadDetail(fakeDeps(), fictionalSession(), {
      registrationReference: "ra1.bad.bad.bad",
    });
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(400);
    }
  });

  it("returns detail with reversible history and no UUID", async () => {
    const reference = createRegistrationReference(
      REGISTRATION_ID,
      EVENT_CODE,
      TEST_SECRET
    );
    const deps = fakeDeps({
      repo: {
        getEventRegistration: async () => registration(),
        listRegistrationCheckins: async () => [checkin],
        resolveStaffDisplayNames: async () =>
          new Map([[checkin.recordedBy ?? "", "Fictional Supervisor"]]),
      },
    });
    const outcome = await loadDetail(deps, fictionalSession(), {
      registrationReference: reference,
    });
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.history).toHaveLength(1);
      const entry = outcome.view.history[0];
      expect(entry.entryReference).not.toBeNull();
      expect(entry.entryReference?.startsWith("en1.")).toBe(true);
      expect(JSON.stringify(outcome.view)).not.toContain(REGISTRATION_ID);
    }
  });
});
