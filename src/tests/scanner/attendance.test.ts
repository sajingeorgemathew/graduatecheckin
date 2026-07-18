import { describe, expect, it } from "vitest";

import {
  summarizeAttendance,
  type CheckinDeltaRow,
} from "@/features/scanner/attendance-summary";
import { validateScan } from "@/features/scanner/service";
import {
  fakeScannerWorld,
  fictionalScannerSession,
  fictionalTicket,
  payloadForTicket,
  scanRequest,
  REGISTRATION_ID,
} from "./helpers";

const session = fictionalScannerSession();

const PARTY = { adultGuests: 2, children0To4: 1, children5To10: 1 };

function admission(
  graduate: number,
  adults: number,
  child04: number,
  child510: number
): CheckinDeltaRow {
  return {
    graduate_delta: graduate,
    adult_guest_delta: adults,
    child_0_4_delta: child04,
    child_5_10_delta: child510,
  };
}

describe("attendance-summary calculation", () => {
  it("returns none with no check-ins", () => {
    const summary = summarizeAttendance(PARTY, []);
    expect(summary.state).toBe("none");
    expect(summary.expectedPartySize).toBe(5);
    expect(summary.remainingPartySize).toBe(5);
  });

  it("returns partial when only part of the party arrived", () => {
    const summary = summarizeAttendance(PARTY, [admission(1, 1, 0, 0)]);
    expect(summary.state).toBe("partial");
    expect(summary.arrivedTotal).toBe(2);
    expect(summary.remainingPartySize).toBe(3);
  });

  it("returns full when the whole registered party arrived", () => {
    const summary = summarizeAttendance(PARTY, [admission(1, 2, 1, 1)]);
    expect(summary.state).toBe("full");
    expect(summary.remainingPartySize).toBe(0);
  });

  it("handles negative reversals safely", () => {
    const summary = summarizeAttendance(PARTY, [
      admission(1, 2, 1, 1),
      admission(-1, -2, -1, -1),
    ]);
    expect(summary.state).toBe("none");
    expect(summary.graduateArrived).toBe(0);
    expect(summary.remainingPartySize).toBe(5);
  });

  it("clamps totals between zero and the registered allowance", () => {
    const overCounted = summarizeAttendance(PARTY, [
      admission(2, 5, 4, 4),
    ]);
    expect(overCounted.graduateArrived).toBe(1);
    expect(overCounted.adultGuestsArrived).toBe(2);
    expect(overCounted.children0To4Arrived).toBe(1);
    expect(overCounted.children5To10Arrived).toBe(1);

    const underCounted = summarizeAttendance(PARTY, [
      admission(-1, -3, 0, 0),
    ]);
    expect(underCounted.graduateArrived).toBe(0);
    expect(underCounted.adultGuestsArrived).toBe(0);
  });
});

describe("registration-level attendance in the service", () => {
  it("returns valid when no attendance is recorded", async () => {
    const world = fakeScannerWorld({ checkins: [] });
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind === "result" && outcome.view.result).toBe("valid");
  });

  it("returns partially_checked_in for partial arrivals", async () => {
    const world = fakeScannerWorld({ checkins: [admission(1, 0, 0, 0)] });
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("partially_checked_in");
      expect(outcome.view.graduateArrived).toBe(1);
      expect(outcome.view.remainingPartySize).toBe(4);
    }
  });

  it("returns already_checked_in when the full party arrived", async () => {
    const world = fakeScannerWorld({ checkins: [admission(1, 2, 1, 1)] });
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind === "result" && outcome.view.result).toBe(
      "already_checked_in"
    );
  });

  it("calculates attendance by registration, not by ticket", async () => {
    const world = fakeScannerWorld({ checkins: [admission(1, 2, 1, 1)] });
    const requested: string[] = [];
    const originalList = world.deps.listCheckinDeltas;
    world.deps.listCheckinDeltas = async (registrationId) => {
      requested.push(registrationId);
      return originalList(registrationId);
    };
    const ticket = fictionalTicket();
    world.addTicket(ticket);

    await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(requested).toEqual([REGISTRATION_ID]);
  });

  it("does not reset attendance when a used ticket was replaced", async () => {
    // The old ticket recorded the check-ins; the replacement resolves to
    // the same registration and must still see them.
    const world = fakeScannerWorld({ checkins: [admission(1, 2, 1, 1)] });
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
      scanRequest("qr", payloadForTicket(replacement))
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("already_checked_in");
      expect(outcome.view.graduateArrived).toBe(1);
    }
  });

  it("never inserts, reverses or modifies check-in rows", async () => {
    const world = fakeScannerWorld({ checkins: [admission(1, 0, 0, 0)] });
    const ticket = fictionalTicket();
    world.addTicket(ticket);

    await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    // The fake dependency surface has no check-in write operation at all;
    // only scan attempts were recorded.
    expect(world.attempts).toHaveLength(1);
    const depNames = Object.keys(world.deps);
    expect(depNames).not.toContain("insertCheckin");
    expect(depNames).not.toContain("recordCheckin");
  });
});
