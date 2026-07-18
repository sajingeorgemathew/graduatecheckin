import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  resolveReplacementChain,
  type ReplacementChainTicket,
} from "@/features/scanner/replacement-chain";
import { validateScan } from "@/features/scanner/service";
import type { GraduationTicketRow } from "@/types/database";
import {
  fakeScannerWorld,
  fictionalRegistration,
  fictionalScannerSession,
  fictionalTicket,
  payloadForTicket,
  scanRequest,
  OTHER_EVENT_ID,
} from "./helpers";

const session = fictionalScannerSession();

function chainTicket(
  overrides: Partial<ReplacementChainTicket> = {}
): ReplacementChainTicket {
  return {
    id: randomUUID(),
    registration_id: "00000000-0000-4000-8000-00000000r001",
    ticket_code: "GR26-AAAA-BBBB",
    status: "replaced",
    replaced_by_ticket_id: null,
    ...overrides,
  };
}

describe("ticket-status validation", () => {
  it("continues to attendance for an active ticket", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind === "result" && outcome.view.result).toBe("valid");
  });

  it("rejects a revoked ticket with clear staff information", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket({ status: "revoked" });
    world.addTicket(ticket);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("revoked");
      expect(outcome.view.ticketCode).toBe(ticket.ticket_code);
      expect(outcome.view.graduateName).not.toBeNull();
    }
  });

  it("rejects a replaced ticket and returns the latest active code", async () => {
    const world = fakeScannerWorld();
    const replacement = fictionalTicket({ status: "active" });
    const old = fictionalTicket({
      status: "replaced",
      replaced_by_ticket_id: replacement.id,
    });
    world.addTicket(replacement);
    world.addTicket(old);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(old))
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("replaced");
      expect(outcome.view.ticketCode).toBe(old.ticket_code);
      expect(outcome.view.latestReplacementTicketCode).toBe(
        replacement.ticket_code
      );
      expect(outcome.view.latestReplacementStatus).toBe("active");
    }
  });

  it("resolves a multi-step replacement chain to the newest ticket", async () => {
    const world = fakeScannerWorld();
    const third = fictionalTicket({ status: "active" });
    const second = fictionalTicket({
      status: "replaced",
      replaced_by_ticket_id: third.id,
    });
    const first = fictionalTicket({
      status: "replaced",
      replaced_by_ticket_id: second.id,
    });
    for (const ticket of [first, second, third]) {
      world.addTicket(ticket);
    }

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(first))
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("replaced");
      expect(outcome.view.latestReplacementTicketCode).toBe(
        third.ticket_code
      );
    }
  });

  it("shows a generic replaced message when the chain has a cycle", async () => {
    const world = fakeScannerWorld();
    const idA = randomUUID();
    const idB = randomUUID();
    const ticketA = fictionalTicket({
      id: idA,
      status: "replaced",
      replaced_by_ticket_id: idB,
    });
    const ticketB = fictionalTicket({
      id: idB,
      status: "replaced",
      replaced_by_ticket_id: idA,
    });
    world.addTicket(ticketA);
    world.addTicket(ticketB);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticketA))
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("replaced");
      expect(outcome.view.latestReplacementTicketCode).toBeNull();
    }
  });

  it("limits chain traversal depth", async () => {
    const registrationId = "00000000-0000-4000-8000-00000000r001";
    const tickets = new Map<string, ReplacementChainTicket>();
    let nextId: string | null = null;
    for (let i = 0; i < 15; i += 1) {
      const ticket = chainTicket({
        replaced_by_ticket_id: nextId,
        registration_id: registrationId,
        status: nextId === null ? "active" : "replaced",
      });
      tickets.set(ticket.id, ticket);
      nextId = ticket.id;
    }
    const start = tickets.get(nextId ?? "");
    expect(start).toBeDefined();

    const resolution = await resolveReplacementChain(
      start as ReplacementChainTicket,
      async (id) => tickets.get(id) ?? null
    );
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) {
      expect(resolution.reason).toBe("depth_exceeded");
    }
  });

  it("detects direct cycles in the pure resolver", async () => {
    const a = chainTicket();
    const b = chainTicket({ replaced_by_ticket_id: a.id });
    a.replaced_by_ticket_id = b.id;
    const lookup = new Map([
      [a.id, a],
      [b.id, b],
    ]);
    const resolution = await resolveReplacementChain(a, async (id) =>
      lookup.get(id) ?? null
    );
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) {
      expect(resolution.reason).toBe("cycle");
    }
  });

  it("rejects chains that leave the registration", async () => {
    const foreign = chainTicket({
      registration_id: "00000000-0000-4000-8000-00000000r999",
      status: "active",
    });
    const start = chainTicket({ replaced_by_ticket_id: foreign.id });
    const lookup = new Map([
      [start.id, start],
      [foreign.id, foreign],
    ]);
    const resolution = await resolveReplacementChain(start, async (id) =>
      lookup.get(id) ?? null
    );
    expect(resolution.ok).toBe(false);
  });

  it("rejects a pending ticket", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket({ status: "pending" });
    world.addTicket(ticket);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind === "result" && outcome.view.result).toBe("pending");
  });

  it("rejects a ticket that belongs to a different event", async () => {
    const world = fakeScannerWorld();
    const otherRegistrationId = "00000000-0000-4000-8000-00000000r777";
    world.registrations.set(
      otherRegistrationId,
      fictionalRegistration({
        id: otherRegistrationId,
        event_id: OTHER_EVENT_ID,
        graduate_full_name: "Jordan Elsewhere",
      })
    );
    const ticket: GraduationTicketRow = fictionalTicket({
      registration_id: otherRegistrationId,
    });
    world.addTicket(ticket);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("wrong_event");
      // No private detail from the other event is revealed.
      expect(outcome.view.graduateName).toBeNull();
      expect(outcome.view.eventName).toBeNull();
    }
  });
});
