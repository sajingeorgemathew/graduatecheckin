import { describe, expect, it } from "vitest";

import { confirmCheckin } from "@/features/checkin/service";
import {
  confirmBody,
  EVENT_ID,
  fakeCheckinWorld,
  fictionalCheckinSession,
  partialResult,
} from "./helpers";

describe("confirmCheckin authorization", () => {
  it("denies inactive staff without calling the database", async () => {
    const world = fakeCheckinWorld();
    const outcome = await confirmCheckin(
      world.deps,
      fictionalCheckinSession("scanner", { isActive: false }),
      confirmBody()
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(403);
    }
    expect(world.calls).toHaveLength(0);
  });

  it("allows scanner, supervisor and administrator roles", async () => {
    for (const role of ["scanner", "supervisor", "administrator"] as const) {
      const world = fakeCheckinWorld();
      const outcome = await confirmCheckin(
        world.deps,
        fictionalCheckinSession(role),
        confirmBody()
      );
      expect(outcome.kind, role).toBe("result");
      expect(world.calls, role).toHaveLength(1);
    }
  });
});

describe("confirmCheckin input handling", () => {
  it("rejects a malformed body with 400 and no database call", async () => {
    const world = fakeCheckinWorld();
    const outcome = await confirmCheckin(
      world.deps,
      fictionalCheckinSession(),
      { validationAttemptId: "nope", requestId: "nope" }
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(400);
    }
    expect(world.calls).toHaveLength(0);
  });

  it("ignores any browser-supplied event id and resolves it server-side", async () => {
    const world = fakeCheckinWorld();
    await confirmCheckin(
      world.deps,
      fictionalCheckinSession(),
      confirmBody({ eventId: "11111111-1111-4111-8111-111111111111" })
    );
    // The strict schema rejects unknown keys, so this body never reaches
    // the database at all.
    expect(world.calls).toHaveLength(0);
  });

  it("forwards the server-resolved event id, never a browser value", async () => {
    const world = fakeCheckinWorld();
    await confirmCheckin(world.deps, fictionalCheckinSession(), confirmBody());
    expect(world.calls[0].eventId).toBe(EVENT_ID);
  });

  it("forwards the trusted actor id from the session", async () => {
    const world = fakeCheckinWorld();
    const session = fictionalCheckinSession();
    await confirmCheckin(world.deps, session, confirmBody());
    expect(world.calls[0].actorUserId).toBe(session.userId);
  });

  it("returns a 503 configuration error when no active event resolves", async () => {
    const world = fakeCheckinWorld();
    world.setEvent({ ok: false, code: "event_not_open" });
    const outcome = await confirmCheckin(
      world.deps,
      fictionalCheckinSession(),
      confirmBody()
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(503);
      expect(outcome.error.error.code).toBe("configuration_error");
    }
    expect(world.calls).toHaveLength(0);
  });
});

describe("confirmCheckin result mapping", () => {
  it("maps a partial success to 200", async () => {
    const world = fakeCheckinWorld();
    const outcome = await confirmCheckin(
      world.deps,
      fictionalCheckinSession(),
      confirmBody()
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("partial");
      expect(outcome.status).toBe(200);
      expect(outcome.view.remainingPartySize).toBe(3);
    }
  });

  it("maps a complete success to 200", async () => {
    const world = fakeCheckinWorld();
    world.setResult(
      partialResult({ result: "complete", remaining_party_size: 0 })
    );
    const outcome = await confirmCheckin(
      world.deps,
      fictionalCheckinSession(),
      confirmBody()
    );
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("complete");
      expect(outcome.status).toBe(200);
    }
  });

  it("maps an idempotent success back to a 200 result", async () => {
    const world = fakeCheckinWorld();
    world.setResult(partialResult({ idempotent: true }));
    const outcome = await confirmCheckin(
      world.deps,
      fictionalCheckinSession(),
      confirmBody()
    );
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("partial");
      expect(outcome.status).toBe(200);
    }
  });

  it.each([
    ["already_complete", 409],
    ["validation_used", 409],
    ["ticket_not_active", 409],
    ["conflict", 409],
    ["validation_expired", 410],
    ["registration_blocked", 422],
    ["wrong_event", 422],
    ["invalid_counts", 422],
    ["allowance_exceeded", 422],
    ["unauthorized", 403],
    ["configuration_error", 503],
  ] as const)("maps failure %s to status %s", async (code, status) => {
    const world = fakeCheckinWorld();
    world.setResult({ ok: false, code });
    const outcome = await confirmCheckin(
      world.deps,
      fictionalCheckinSession(),
      confirmBody()
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe(code);
      expect(outcome.status).toBe(status);
    }
  });

  it("returns a 500 internal error for an unrecognized result", async () => {
    const world = fakeCheckinWorld();
    world.setResult({ ok: false, code: "totally_unknown" });
    const outcome = await confirmCheckin(
      world.deps,
      fictionalCheckinSession(),
      confirmBody()
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(500);
    }
  });

  it("returns a 500 internal error when the database call throws", async () => {
    const world = fakeCheckinWorld();
    world.deps.applyCheckin = async () => {
      throw new Error("boom");
    };
    const outcome = await confirmCheckin(
      world.deps,
      fictionalCheckinSession(),
      confirmBody()
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(500);
      expect(outcome.error.error.message).not.toContain("boom");
    }
  });

  it("keeps the same request id and attempt id for a network retry", async () => {
    const world = fakeCheckinWorld();
    const body = confirmBody();
    await confirmCheckin(world.deps, fictionalCheckinSession(), body);
    await confirmCheckin(world.deps, fictionalCheckinSession(), body);
    expect(world.calls[0].requestId).toBe(world.calls[1].requestId);
    expect(world.calls[0].validationAttemptId).toBe(
      world.calls[1].validationAttemptId
    );
  });
});
