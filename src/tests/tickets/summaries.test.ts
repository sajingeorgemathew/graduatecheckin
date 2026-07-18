import { describe, expect, it } from "vitest";

import {
  buildGenerationCandidates,
  buildTicketListPage,
  computeTicketSummary,
  displayTicketFor,
  matchesTicketSearch,
} from "@/features/tickets/summaries";
import type {
  RegistrationTicketSnapshot,
  RegistrationWithTickets,
} from "@/features/tickets/types";

const EVENT_ID = "11111111-2222-4333-8444-555555555555";

let counter = 0;

function registration(
  overrides: Partial<RegistrationWithTickets> = {}
): RegistrationWithTickets {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    event_id: EVENT_ID,
    graduate_full_name: `Test Graduate ${String(counter).padStart(3, "0")}`,
    source_registration_id: `MOCK-${1000 + counter}`,
    registration_status: "eligible",
    expected_party_size: 3,
    registered_adult_guests: 2,
    registered_children_0_4: 0,
    registered_children_5_10: 0,
    is_test: true,
    tickets: [],
    ...overrides,
  };
}

function ticket(
  overrides: Partial<RegistrationTicketSnapshot> = {}
): RegistrationTicketSnapshot {
  counter += 1;
  return {
    id: `10000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    ticket_code: "GR26-TEST-CODE",
    status: "active",
    issued_at: "2026-07-17T12:00:00Z",
    created_at: "2026-07-17T12:00:00Z",
    ...overrides,
  };
}

describe("ticket summaries", () => {
  it("computes every summary count", () => {
    const registrations = [
      registration({ tickets: [ticket()] }),
      registration(),
      registration({ registration_status: "failed" }),
      registration({ registration_status: "cancelled" }),
      registration({
        tickets: [
          ticket({ status: "replaced" }),
          ticket({ status: "active" }),
        ],
      }),
      registration({ tickets: [ticket({ status: "revoked" })] }),
    ];
    const summary = computeTicketSummary(registrations);
    expect(summary.eligibleRegistrations).toBe(4);
    expect(summary.activeTickets).toBe(2);
    expect(summary.eligibleWithoutTickets).toBe(2);
    expect(summary.revokedTickets).toBe(1);
    expect(summary.replacedTickets).toBe(1);
    expect(summary.blockedRegistrations).toBe(2);
  });

  it("prefers the active ticket for display", () => {
    const active = ticket({ status: "active", created_at: "2026-01-01T00:00:00Z" });
    const replaced = ticket({ status: "replaced", created_at: "2026-02-01T00:00:00Z" });
    const row = registration({ tickets: [replaced, active] });
    expect(displayTicketFor(row)?.id).toBe(active.id);
  });

  it("falls back to the latest non-active ticket", () => {
    const older = ticket({ status: "replaced", created_at: "2026-01-01T00:00:00Z" });
    const newer = ticket({ status: "revoked", created_at: "2026-03-01T00:00:00Z" });
    const row = registration({ tickets: [older, newer] });
    expect(displayTicketFor(row)?.id).toBe(newer.id);
  });

  it("filters not generated to eligible registrations without active tickets", () => {
    const withTicket = registration({ tickets: [ticket()] });
    const without = registration();
    const blocked = registration({ registration_status: "failed" });
    const page = buildTicketListPage(
      [withTicket, without, blocked],
      "not_generated",
      "",
      1
    );
    expect(page.totalCount).toBe(1);
    expect(page.rows[0].registrationId).toBe(without.id);
  });

  it("searches by name, ticket code and source registration ID only", () => {
    const row = registration({
      graduate_full_name: "Test Graduate Search",
      source_registration_id: "MOCK-9999",
      tickets: [ticket({ ticket_code: "GR26-ABCD-EFGH" })],
    });
    expect(matchesTicketSearch(row, "graduate search")).toBe(true);
    expect(matchesTicketSearch(row, "mock-9999")).toBe(true);
    expect(matchesTicketSearch(row, "abcd-efgh")).toBe(true);
    expect(matchesTicketSearch(row, "nomatch")).toBe(false);
  });

  it("paginates at 25 rows per page", () => {
    const registrations = Array.from({ length: 30 }, () => registration());
    const first = buildTicketListPage(registrations, "all", "", 1);
    const second = buildTicketListPage(registrations, "all", "", 2);
    expect(first.pageSize).toBe(25);
    expect(first.rows).toHaveLength(25);
    expect(second.rows).toHaveLength(5);
    expect(first.totalPages).toBe(2);
  });

  it("exposes no contact information in list rows", () => {
    const page = buildTicketListPage([registration()], "all", "", 1);
    const keys = Object.keys(page.rows[0]);
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("phone");
    expect(keys).not.toContain("token_hash");
  });

  it("builds generation candidates from eligible unticketed registrations only", () => {
    const eligible = registration();
    const ticketed = registration({ tickets: [ticket()] });
    const blocked = registration({ registration_status: "review_required" });
    const candidates = buildGenerationCandidates([eligible, ticketed, blocked]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].registrationId).toBe(eligible.id);
  });
});
