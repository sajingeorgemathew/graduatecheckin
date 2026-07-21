import { describe, expect, it } from "vitest";

import {
  evaluateDeliveryEligibility,
  type EligibilityInput,
} from "@/features/distribution/preparation-rules";

function input(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    mode: "production",
    eventId: "event-1",
    eventIsTest: false,
    allowTestRecipientOverride: false,
    currentTemplateVersion: 1,
    registration: {
      id: "reg-1",
      eventId: "event-1",
      registrationStatus: "eligible",
      email: "grad@example.com",
    },
    ticket: { id: "ticket-1", registrationId: "reg-1", status: "active" },
    document: {
      id: "doc-1",
      eventId: "event-1",
      registrationId: "reg-1",
      ticketId: "ticket-1",
      status: "current",
      templateVersion: 1,
      sha256Checksum: "a".repeat(64),
    },
    alreadyBatched: false,
    ...overrides,
  };
}

describe("delivery eligibility rules", () => {
  it("accepts a fully valid production delivery", () => {
    expect(evaluateDeliveryEligibility(input()).ok).toBe(true);
  });

  it("rejects a missing email", () => {
    const result = evaluateDeliveryEligibility(
      input({ registration: { ...input().registration, email: null } })
    );
    expect(result).toEqual({ ok: false, reason: "missing_email" });
  });

  it("rejects an invalid email", () => {
    const result = evaluateDeliveryEligibility(
      input({ registration: { ...input().registration, email: "not-an-email" } })
    );
    expect(result).toEqual({ ok: false, reason: "invalid_email" });
  });

  it("rejects a cancelled registration", () => {
    const result = evaluateDeliveryEligibility(
      input({
        registration: { ...input().registration, registrationStatus: "cancelled" },
      })
    );
    expect(result).toEqual({ ok: false, reason: "registration_cancelled" });
  });

  it("rejects a revoked ticket", () => {
    const result = evaluateDeliveryEligibility(
      input({ ticket: { id: "t", registrationId: "reg-1", status: "revoked" } })
    );
    expect(result).toEqual({ ok: false, reason: "ticket_revoked" });
  });

  it("rejects a replaced ticket", () => {
    const result = evaluateDeliveryEligibility(
      input({ ticket: { id: "t", registrationId: "reg-1", status: "replaced" } })
    );
    expect(result).toEqual({ ok: false, reason: "ticket_replaced" });
  });

  it("rejects a superseded document", () => {
    const result = evaluateDeliveryEligibility(
      input({ document: { ...input().document!, status: "superseded" } })
    );
    expect(result).toEqual({ ok: false, reason: "superseded_document" });
  });

  it("rejects an outdated (older template) document", () => {
    const result = evaluateDeliveryEligibility(
      input({ document: { ...input().document!, templateVersion: 0 } })
    );
    expect(result).toEqual({ ok: false, reason: "outdated_document" });
  });

  it("rejects a document that belongs to another registration", () => {
    const result = evaluateDeliveryEligibility(
      input({ document: { ...input().document!, registrationId: "other" } })
    );
    expect(result).toEqual({ ok: false, reason: "document_event_mismatch" });
  });

  it("rejects production mode against a test event", () => {
    const result = evaluateDeliveryEligibility(
      input({ mode: "production", eventIsTest: true })
    );
    expect(result).toEqual({ ok: false, reason: "mode_event_mismatch" });
  });

  it("rejects test mode against a production event without the override", () => {
    const result = evaluateDeliveryEligibility(
      input({ mode: "test", eventIsTest: false, allowTestRecipientOverride: false })
    );
    expect(result).toEqual({ ok: false, reason: "mode_event_mismatch" });
  });

  it("allows test mode against a production event with the override", () => {
    const result = evaluateDeliveryEligibility(
      input({ mode: "test", eventIsTest: false, allowTestRecipientOverride: true })
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a registration already in a delivery batch", () => {
    const result = evaluateDeliveryEligibility(input({ alreadyBatched: true }));
    expect(result).toEqual({ ok: false, reason: "already_in_delivery_batch" });
  });

  it("rejects a missing current document", () => {
    const result = evaluateDeliveryEligibility(input({ document: null }));
    expect(result).toEqual({ ok: false, reason: "no_current_document" });
  });
});
