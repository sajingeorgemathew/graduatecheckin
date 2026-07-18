import { describe, expect, it } from "vitest";

import { canConfirmCheckin } from "@/features/checkin/permissions";
import { mapCheckinResult } from "@/features/checkin/service";
import { partialResult } from "./helpers";

const FORBIDDEN_KEYS = [
  "email",
  "phone",
  "guest_names",
  "guest_name",
  "payment",
  "payment_status",
  "source_order_id",
  "raw_token",
  "token",
  "token_hash",
  "qr_payload",
  "payload",
  "registration_id",
  "ticket_id",
  "checkin_id",
  "validation_attempt_id",
  "validationAttemptId",
  "internal_notes",
];

describe("checkin response privacy", () => {
  it("never carries contact, payment, token or database id fields", () => {
    // A hostile or buggy database result that leaks extra fields must not
    // reach the browser view: the mapper only copies known safe fields.
    const outcome = mapCheckinResult(
      partialResult({
        email: "leak@example.com",
        phone: "555-0100",
        guest_names: "Should Not Appear",
        payment_status: "paid",
        source_order_id: "ORDER-123",
        raw_token: "TAE-GRAD1:leak",
        token_hash: "deadbeef",
        qr_payload: "TAE-GRAD1:leak",
        registration_id: "00000000-0000-4000-8000-00000000r001",
        ticket_id: "00000000-0000-4000-8000-00000000t001",
        checkin_id: "00000000-0000-4000-8000-00000000k001",
        validation_attempt_id: "00000000-0000-4000-8000-00000000a001",
        internal_notes: "private",
      })
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind !== "result") {
      return;
    }
    const serialized = JSON.stringify(outcome.view);
    for (const key of FORBIDDEN_KEYS) {
      expect(serialized, key).not.toContain(key);
    }
    expect(serialized).not.toContain("leak@example.com");
    expect(serialized).not.toContain("ORDER-123");
    expect(serialized).not.toContain("deadbeef");
    expect(serialized).not.toContain("00000000-0000-4000-8000-00000000r001");
  });

  it("keeps only the safe display fields", () => {
    const outcome = mapCheckinResult(partialResult());
    if (outcome.kind !== "result") {
      throw new Error("expected a result");
    }
    expect(outcome.view.graduateName).toBe("Avery Fictional");
    expect(outcome.view.ticketCode).toBe("GR26-TEST-2345");
    expect(outcome.view.remainingPartySize).toBe(3);
  });
});

describe("checkin permissions", () => {
  it("allows scanner, supervisor and administrator", () => {
    expect(canConfirmCheckin("scanner")).toBe(true);
    expect(canConfirmCheckin("supervisor")).toBe(true);
    expect(canConfirmCheckin("administrator")).toBe(true);
  });
});
