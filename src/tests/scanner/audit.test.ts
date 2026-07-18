import { describe, expect, it } from "vitest";

import { validateScan } from "@/features/scanner/service";
import {
  fakeScannerWorld,
  fictionalScannerSession,
  fictionalTicket,
  payloadForTicket,
  scanRequest,
  EVENT_ID,
  REGISTRATION_ID,
} from "./helpers";

const session = fictionalScannerSession();

describe("scan-attempt audit", () => {
  it("records a valid attempt with staff, event and snapshots", async () => {
    const world = fakeScannerWorld({
      checkins: [
        {
          graduate_delta: 1,
          adult_guest_delta: 1,
          child_0_4_delta: 0,
          child_5_10_delta: 0,
        },
      ],
    });
    const ticket = fictionalTicket();
    world.addTicket(ticket);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(world.attempts).toHaveLength(1);
    const attempt = world.attempts[0];
    expect(attempt.staff_user_id).toBe(session.userId);
    expect(attempt.event_id).toBe(EVENT_ID);
    expect(attempt.ticket_id).toBe(ticket.id);
    expect(attempt.registration_id).toBe(REGISTRATION_ID);
    expect(attempt.method).toBe("qr");
    expect(attempt.result).toBe("partially_checked_in");
    expect(attempt.ticket_status_snapshot).toBe("active");
    expect(attempt.registration_status_snapshot).toBe("eligible");
    expect(attempt.graduate_arrived_snapshot).toBe(1);
    expect(attempt.adult_guests_arrived_snapshot).toBe(1);
    expect(attempt.children_0_4_arrived_snapshot).toBe(0);
    expect(attempt.children_5_10_arrived_snapshot).toBe(0);

    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.validationAttemptId).not.toBeNull();
    }
  });

  it("records invalid attempts", async () => {
    const world = fakeScannerWorld();
    await validateScan(
      world.deps,
      session,
      scanRequest("qr", "TAE-GRAD1:v1.not-a-ticket.bad")
    );
    expect(world.attempts).toHaveLength(1);
    expect(world.attempts[0].result).toBe("invalid");
    expect(world.attempts[0].ticket_id).toBeNull();
  });

  it("records manual attempts with the manual_code method", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    await validateScan(
      world.deps,
      session,
      scanRequest("manual_code", ticket.ticket_code)
    );
    expect(world.attempts).toHaveLength(1);
    expect(world.attempts[0].method).toBe("manual_code");
  });

  it("stores no ticket code, name, payload or token material", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    const payload = payloadForTicket(ticket);

    await validateScan(world.deps, session, scanRequest("qr", payload));
    const serialized = JSON.stringify(world.attempts[0]);
    expect(serialized).not.toContain(ticket.ticket_code);
    expect(serialized).not.toContain("Avery Fictional");
    expect(serialized).not.toContain(payload);
    expect(serialized).not.toContain(ticket.token_hash);
    const keys = Object.keys(world.attempts[0]);
    expect(keys).not.toContain("ticket_code");
    expect(keys).not.toContain("graduate_name");
    expect(keys).not.toContain("payload");
    expect(keys).not.toContain("token_hash");
  });

  it("keeps the request id idempotent per staff user", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    const request = scanRequest("qr", payloadForTicket(ticket));

    const first = await validateScan(world.deps, session, request);
    const second = await validateScan(world.deps, session, request);
    expect(world.attempts).toHaveLength(1);
    expect(first.kind).toBe("result");
    expect(second.kind).toBe("result");
    if (first.kind === "result" && second.kind === "result") {
      expect(second.view.validationAttemptId).toBe(
        first.view.validationAttemptId
      );
    }
  });
});
