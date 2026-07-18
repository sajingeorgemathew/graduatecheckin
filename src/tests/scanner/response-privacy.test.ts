import { describe, expect, it } from "vitest";

import { validateScan } from "@/features/scanner/service";
import {
  fakeScannerWorld,
  fictionalRegistration,
  fictionalScannerSession,
  fictionalTicket,
  payloadForTicket,
  scanRequest,
  REGISTRATION_ID,
} from "./helpers";

const session = fictionalScannerSession();

describe("scanner response privacy", () => {
  it("returns no contact, payment, token or database detail", async () => {
    const world = fakeScannerWorld();
    world.registrations.set(
      REGISTRATION_ID,
      fictionalRegistration({
        email: "fictional.graduate@example.com",
        phone: "+1 555 0100",
        source_registration_id: "ORDER-FICTIONAL-42",
        internal_notes: "Fictional note",
        fee_total: 123.45,
      })
    );
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    const payload = payloadForTicket(ticket);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payload)
    );
    expect(outcome.kind).toBe("result");
    const serialized = JSON.stringify(outcome);

    expect(serialized).not.toContain("fictional.graduate@example.com");
    expect(serialized).not.toContain("555 0100");
    expect(serialized).not.toContain("ORDER-FICTIONAL-42");
    expect(serialized).not.toContain("Fictional note");
    expect(serialized).not.toContain("123.45");
    expect(serialized).not.toContain(ticket.token_hash);
    expect(serialized).not.toContain(payload);
    expect(serialized).not.toContain("TAE-GRAD1");
    expect(serialized.toLowerCase()).not.toContain("email");
    expect(serialized.toLowerCase()).not.toContain("phone");
    expect(serialized.toLowerCase()).not.toContain("payment");
    expect(serialized.toLowerCase()).not.toContain("token_hash");
    expect(serialized.toLowerCase()).not.toContain("tokenhash");
  });

  it("returns no guest names", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    const serialized = JSON.stringify(outcome).toLowerCase();
    expect(serialized).not.toContain("guest_name");
    expect(serialized).not.toContain("guestname");
  });

  it("returns no database ids for browser use", async () => {
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
      const serialized = JSON.stringify(outcome.view);
      expect(serialized).not.toContain(ticket.id);
      expect(serialized).not.toContain(REGISTRATION_ID);
    }
  });

  it("returns no database error details on failure", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    world.deps.getRegistrationById = async () => {
      throw new Error("duplicate key value violates unique constraint");
    };

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind).toBe("error");
    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain("duplicate key");
    expect(serialized).not.toContain("constraint");
    expect(serialized).not.toContain("stack");
  });

  it("does not reflect submitted values in schema errors", async () => {
    const world = fakeScannerWorld();
    const outcome = await validateScan(world.deps, session, {
      method: "qr",
      value: "SOME-SUSPICIOUS-VALUE",
      requestId: "not-a-uuid",
    });
    expect(outcome.kind).toBe("error");
    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain("SOME-SUSPICIOUS-VALUE");
    expect(serialized).not.toContain("not-a-uuid");
  });
});
