import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCAN_RATE_LIMIT,
  isRateLimited,
  rateLimitWindowStart,
} from "@/features/scanner/rate-limit";
import { validateScan } from "@/features/scanner/service";
import {
  fakeScannerWorld,
  fictionalScannerSession,
  fictionalTicket,
  payloadForTicket,
  scanRequest,
} from "./helpers";

const session = fictionalScannerSession();

describe("scan rate limiting", () => {
  it("uses a 60 request per rolling minute default", () => {
    expect(DEFAULT_SCAN_RATE_LIMIT.maxRequests).toBe(60);
    expect(DEFAULT_SCAN_RATE_LIMIT.windowMs).toBe(60_000);
  });

  it("computes the rolling window start from an injectable clock", () => {
    const now = new Date("2026-08-01T16:00:00.000Z");
    expect(rateLimitWindowStart(now).toISOString()).toBe(
      "2026-08-01T15:59:00.000Z"
    );
    expect(
      rateLimitWindowStart(now, { maxRequests: 5, windowMs: 5000 }).toISOString()
    ).toBe("2026-08-01T15:59:55.000Z");
  });

  it("allows up to the limit and blocks the excess", () => {
    expect(isRateLimited(0)).toBe(false);
    expect(isRateLimited(59)).toBe(false);
    expect(isRateLimited(60)).toBe(true);
    expect(isRateLimited(2, { maxRequests: 2, windowMs: 1000 })).toBe(true);
  });

  it("allows normal scanning under the limit", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    world.setRecentAttemptCount(10);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind === "result" && outcome.view.result).toBe("valid");
  });

  it("allows the sixtieth attempt within a minute", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    world.setRecentAttemptCount(59);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind === "result" && outcome.view.result).toBe("valid");
  });

  it("returns 429 for excess attempts", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    world.setRecentAttemptCount(60);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.status).toBe(429);
      expect(outcome.view.result).toBe("rate_limited");
    }
  });

  it("limits per staff user, so another staff user is not blocked", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    const blockedUser = session.userId;
    world.deps.countScanAttemptsSince = async (staffUserId) =>
      staffUserId === blockedUser ? 60 : 0;

    const blocked = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(blocked.kind === "result" && blocked.view.result).toBe(
      "rate_limited"
    );

    const otherSession = fictionalScannerSession("scanner", {
      userId: "00000000-0000-4000-8000-0000000000d4",
    });
    const allowed = await validateScan(
      world.deps,
      otherSession,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(allowed.kind === "result" && allowed.view.result).toBe("valid");
  });

  it("records a rate_limited attempt without any scanned data", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    world.setRecentAttemptCount(60);

    await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(world.attempts).toHaveLength(1);
    const attempt = world.attempts[0];
    expect(attempt.result).toBe("rate_limited");
    expect(attempt.ticket_id).toBeNull();
    expect(attempt.registration_id).toBeNull();
    expect(attempt.ticket_status_snapshot).toBeNull();
    const serialized = JSON.stringify(attempt);
    expect(serialized).not.toContain("TAE-GRAD1");
    expect(serialized).not.toContain(ticket.ticket_code);
  });

  it("supports overriding the limit for tests", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    world.deps.rateLimit = { maxRequests: 1, windowMs: 1000 };
    world.setRecentAttemptCount(1);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind === "result" && outcome.view.result).toBe(
      "rate_limited"
    );
  });
});
