import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  createEntryReference,
  createRegistrationReference,
  MAX_REFERENCE_LIFETIME_SECONDS,
} from "@/features/attendance/action-token";
import { recordManualArrival } from "@/features/attendance/manual-arrival";
import { applyAttendanceCorrection } from "@/features/attendance/correction";
import { reverseAttendanceEntry } from "@/features/attendance/reversal";
import type {
  CorrectionArgs,
  ManualArrivalArgs,
  ReversalArgs,
} from "@/features/attendance/repository";
import type { Json } from "@/types/database";
import {
  CHECKIN_ID,
  EVENT_CODE,
  EVENT_ID,
  REGISTRATION_ID,
  TEST_SECRET,
  fakeDeps,
  fictionalSession,
  okWriteResult,
} from "./helpers";

function registrationRef(now?: number): string {
  return createRegistrationReference(REGISTRATION_ID, EVENT_CODE, TEST_SECRET, {
    now,
  });
}

function entryRef(now?: number): string {
  return createEntryReference(CHECKIN_ID, EVENT_CODE, TEST_SECRET, { now });
}

function manualBody(overrides: Record<string, unknown> = {}) {
  return {
    registrationReference: registrationRef(),
    requestId: randomUUID(),
    graduateArriving: 1,
    adultGuestsArriving: 0,
    children0To4Arriving: 0,
    children5To10Arriving: 0,
    reason: "Ticket unavailable",
    ...overrides,
  };
}

describe("recordManualArrival", () => {
  it("denies a scanner with 403 and no rpc call", async () => {
    let called = false;
    const deps = fakeDeps({
      repo: {
        applyManualArrivalRpc: async () => {
          called = true;
          return okWriteResult();
        },
      },
    });
    const outcome = await recordManualArrival(
      deps,
      fictionalSession("scanner"),
      manualBody()
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(403);
    }
    expect(called).toBe(false);
  });

  it("rejects a malformed body with 400", async () => {
    const outcome = await recordManualArrival(fakeDeps(), fictionalSession(), {
      registrationReference: registrationRef(),
    });
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(400);
    }
  });

  it("rejects an expired registration reference with 410", async () => {
    const past = Date.now() - (MAX_REFERENCE_LIFETIME_SECONDS + 60) * 1000;
    const outcome = await recordManualArrival(
      fakeDeps(),
      fictionalSession(),
      manualBody({ registrationReference: registrationRef(past) })
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(410);
    }
  });

  it("forwards the trusted actor, event and registration id and returns a view", async () => {
    const calls: ManualArrivalArgs[] = [];
    const deps = fakeDeps({
      repo: {
        applyManualArrivalRpc: async (args) => {
          calls.push(args);
          return okWriteResult();
        },
      },
    });
    const session = fictionalSession();
    const outcome = await recordManualArrival(deps, session, manualBody());
    expect(outcome.kind).toBe("result");
    expect(calls[0].actorUserId).toBe(session.userId);
    expect(calls[0].eventId).toBe(EVENT_ID);
    expect(calls[0].registrationId).toBe(REGISTRATION_ID);
  });

  it("maps an allowance_exceeded result to 422", async () => {
    const deps = fakeDeps({
      repo: {
        applyManualArrivalRpc: async () =>
          ({ ok: false, code: "allowance_exceeded" }) as Json,
      },
    });
    const outcome = await recordManualArrival(
      deps,
      fictionalSession(),
      manualBody()
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(422);
    }
  });
});

describe("applyAttendanceCorrection", () => {
  function correctionBody(overrides: Record<string, unknown> = {}) {
    return {
      registrationReference: registrationRef(),
      requestId: randomUUID(),
      graduateDelta: 0,
      adultGuestDelta: -1,
      child0To4Delta: 0,
      child5To10Delta: 0,
      reason: "Adult counted twice",
      ...overrides,
    };
  }

  it("denies a scanner with 403", async () => {
    const outcome = await applyAttendanceCorrection(
      fakeDeps(),
      fictionalSession("scanner"),
      correctionBody()
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(403);
    }
  });

  it("forwards negative deltas and returns a view", async () => {
    const calls: CorrectionArgs[] = [];
    const deps = fakeDeps({
      repo: {
        applyCorrectionRpc: async (args) => {
          calls.push(args);
          return okWriteResult();
        },
      },
    });
    const outcome = await applyAttendanceCorrection(
      deps,
      fictionalSession(),
      correctionBody()
    );
    expect(outcome.kind).toBe("result");
    expect(calls[0].adultGuestDelta).toBe(-1);
    expect(calls[0].reason).toBe("Adult counted twice");
  });

  it("maps a result_out_of_range result to 422", async () => {
    const deps = fakeDeps({
      repo: {
        applyCorrectionRpc: async () =>
          ({ ok: false, code: "result_out_of_range" }) as Json,
      },
    });
    const outcome = await applyAttendanceCorrection(
      deps,
      fictionalSession(),
      correctionBody()
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(422);
    }
  });
});

describe("reverseAttendanceEntry", () => {
  function reversalBody(overrides: Record<string, unknown> = {}) {
    return {
      entryReference: entryRef(),
      requestId: randomUUID(),
      reason: "Recorded in error",
      ...overrides,
    };
  }

  it("denies a scanner with 403", async () => {
    const outcome = await reverseAttendanceEntry(
      fakeDeps(),
      fictionalSession("scanner"),
      reversalBody()
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(403);
    }
  });

  it("forwards the original check-in id from the entry reference", async () => {
    const calls: ReversalArgs[] = [];
    const deps = fakeDeps({
      repo: {
        reverseCheckinRpc: async (args) => {
          calls.push(args);
          return okWriteResult();
        },
      },
    });
    const outcome = await reverseAttendanceEntry(
      deps,
      fictionalSession(),
      reversalBody()
    );
    expect(outcome.kind).toBe("result");
    expect(calls[0].originalCheckinId).toBe(CHECKIN_ID);
  });

  it("maps an already_reversed result to 409", async () => {
    const deps = fakeDeps({
      repo: {
        reverseCheckinRpc: async () =>
          ({ ok: false, code: "already_reversed" }) as Json,
      },
    });
    const outcome = await reverseAttendanceEntry(
      deps,
      fictionalSession(),
      reversalBody()
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(409);
    }
  });

  it("maps an unsafe_reversal result to 422", async () => {
    const deps = fakeDeps({
      repo: {
        reverseCheckinRpc: async () =>
          ({ ok: false, code: "unsafe_reversal" }) as Json,
      },
    });
    const outcome = await reverseAttendanceEntry(
      deps,
      fictionalSession(),
      reversalBody()
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(422);
    }
  });

  it("rejects a registration reference used as an entry reference", async () => {
    const outcome = await reverseAttendanceEntry(
      fakeDeps(),
      fictionalSession(),
      reversalBody({ entryReference: registrationRef() })
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(400);
    }
  });
});
