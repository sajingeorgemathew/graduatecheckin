import { describe, expect, it } from "vitest";

import { validateScan } from "@/features/scanner/service";
import type { RegistrationStatus } from "@/types/database";
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

async function scanWithRegistrationStatus(status: RegistrationStatus) {
  const world = fakeScannerWorld();
  world.registrations.set(
    REGISTRATION_ID,
    fictionalRegistration({
      registration_status: status,
      internal_notes: "Fictional internal reviewer note",
    })
  );
  const ticket = fictionalTicket();
  world.addTicket(ticket);
  const outcome = await validateScan(
    world.deps,
    session,
    scanRequest("qr", payloadForTicket(ticket))
  );
  return outcome;
}

describe("registration-status validation", () => {
  it("continues for an eligible registration", async () => {
    const outcome = await scanWithRegistrationStatus("eligible");
    expect(outcome.kind === "result" && outcome.view.result).toBe("valid");
  });

  it("blocks a failed registration", async () => {
    const outcome = await scanWithRegistrationStatus("failed");
    expect(outcome.kind === "result" && outcome.view.result).toBe(
      "registration_blocked"
    );
  });

  it("blocks a cancelled registration", async () => {
    const outcome = await scanWithRegistrationStatus("cancelled");
    expect(outcome.kind === "result" && outcome.view.result).toBe(
      "registration_blocked"
    );
  });

  it("blocks a review-required registration", async () => {
    const outcome = await scanWithRegistrationStatus("review_required");
    expect(outcome.kind === "result" && outcome.view.result).toBe(
      "registration_blocked"
    );
  });

  it("returns the registration status for staff display", async () => {
    const outcome = await scanWithRegistrationStatus("review_required");
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.registrationStatus).toBe("review_required");
    }
  });

  it("never returns internal notes", async () => {
    for (const status of [
      "eligible",
      "failed",
      "cancelled",
      "review_required",
    ] as const) {
      const outcome = await scanWithRegistrationStatus(status);
      const serialized = JSON.stringify(outcome);
      expect(serialized).not.toContain("internal");
      expect(serialized).not.toContain("Fictional internal reviewer note");
    }
  });
});
