import { describe, expect, it } from "vitest";

import { QR_PAYLOAD_PREFIX } from "@/features/tickets/qr-payload";
import { buildTicketToken } from "@/features/tickets/token";
import { validateScan } from "@/features/scanner/service";
import {
  fakeScannerWorld,
  fictionalScannerSession,
  fictionalTicket,
  payloadForTicket,
  scanRequest,
  TEST_TICKET_SECRET,
} from "./helpers";

const session = fictionalScannerSession();

describe("QR validation sequence", () => {
  it("accepts a correctly prefixed, correctly signed payload", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("valid");
      expect(outcome.view.ticketCode).toBe(ticket.ticket_code);
    }
  });

  it("rejects an unknown prefix as generic invalid", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    const token = buildTicketToken(ticket.id, TEST_TICKET_SECRET);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", `WRONG-PREFIX:${token}`)
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("invalid");
    }
  });

  it("rejects a modified signature", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    const token = buildTicketToken(ticket.id, TEST_TICKET_SECRET);
    const tampered = `${token.slice(0, -4)}AAAA`;

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", `${QR_PAYLOAD_PREFIX}${tampered}`)
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("invalid");
    }
  });

  it("rejects a token whose embedded ticket UUID was modified", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    const token = buildTicketToken(ticket.id, TEST_TICKET_SECRET);
    const otherId = "11111111-2222-4333-8444-555566667777";
    const swapped = token.replace(ticket.id, otherId);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", `${QR_PAYLOAD_PREFIX}${swapped}`)
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("invalid");
    }
  });

  it("rejects a correctly signed token when the stored hash mismatches", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket({
      token_hash: "a".repeat(64),
    });
    world.addTicket(ticket);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("invalid");
    }
  });

  it("treats an unknown ticket as generic invalid", async () => {
    const world = fakeScannerWorld();
    const ghost = fictionalTicket();

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ghost))
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("invalid");
    }
  });

  it("exposes no cryptographic failure detail and no token material", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    const payload = payloadForTicket(ticket);
    const token = payload.slice(QR_PAYLOAD_PREFIX.length);

    const outcomes = [
      await validateScan(world.deps, session, scanRequest("qr", "TAE-GRAD1:v1..x")),
      await validateScan(world.deps, session, scanRequest("qr", payload)),
    ];
    for (const outcome of outcomes) {
      const serialized = JSON.stringify(outcome);
      expect(serialized).not.toContain(token);
      expect(serialized).not.toContain(ticket.token_hash);
      expect(serialized).not.toContain("signature");
      expect(serialized).not.toContain("hmac");
      expect(serialized.toLowerCase()).not.toContain("hash");
    }
  });
});
