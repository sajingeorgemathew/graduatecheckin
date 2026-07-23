/**
 * CHECKIN-10A production eligibility rules.
 *
 * Every registration must land in exactly one bucket, and an initial batch
 * must never include someone who already has their ticket by any route.
 * All names and addresses here are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  classifyProductionEligibility,
  findOpenBatchCollisions,
  selectInitialBatchCandidates,
  selectRetryCandidates,
  summarizeProductionEligibility,
  type ProductionEligibilityInput,
} from "@/features/distribution/production-eligibility";
import { evaluateDeliveryEligibility } from "@/features/distribution/preparation-rules";

function candidate(
  overrides: Partial<ProductionEligibilityInput> = {}
): ProductionEligibilityInput {
  return {
    registrationId: "reg-1",
    graduateName: "Synthetic Graduate One",
    registrationStatus: "eligible",
    email: "synthetic.one@example.test",
    ticketStatus: "active",
    hasCurrentDocument: true,
    productionSent: false,
    externallySent: false,
    inOpenProductionBatch: false,
    productionFailed: false,
    suppressed: false,
    ...overrides,
  };
}

describe("CHECKIN-10A production eligibility", () => {
  it("treats a ready, never-sent graduate as eligible for initial delivery", () => {
    const decision = classifyProductionEligibility(candidate());
    expect(decision.category).toBe("eligible_initial");
    expect(decision.resendEligible).toBe(true);
    expect(decision.retryEligible).toBe(false);
  });

  it("excludes a graduate who has already been production sent", () => {
    const decision = classifyProductionEligibility(
      candidate({ productionSent: true })
    );
    expect(decision.category).toBe("already_production_sent");
    // The ticket is still valid, so a deliberate resend stays available.
    expect(decision.resendEligible).toBe(true);
  });

  it("excludes a graduate recorded as previously sent outside the system", () => {
    const decision = classifyProductionEligibility(
      candidate({ externallySent: true })
    );
    expect(decision.category).toBe("previously_sent_externally");
    expect(decision.resendEligible).toBe(true);
  });

  it("excludes a graduate already sitting in an open production batch", () => {
    const decision = classifyProductionEligibility(
      candidate({ inOpenProductionBatch: true })
    );
    expect(decision.category).toBe("in_open_production_batch");
  });

  it("reports an invalid or missing email rather than preparing it", () => {
    expect(classifyProductionEligibility(candidate({ email: null })).category).toBe(
      "invalid_email"
    );
    expect(
      classifyProductionEligibility(candidate({ email: "not-an-address" }))
        .category
    ).toBe("invalid_email");
  });

  it("requires a replacement for a revoked or replaced ticket", () => {
    for (const ticketStatus of ["revoked", "replaced"]) {
      const decision = classifyProductionEligibility(
        candidate({ ticketStatus })
      );
      expect(decision.category, ticketStatus).toBe("replacement_required");
      // A ticket that must change is never quietly resent.
      expect(decision.resendEligible, ticketStatus).toBe(false);
    }
  });

  it("holds back a graduate with no current ticket or PDF", () => {
    expect(
      classifyProductionEligibility(candidate({ ticketStatus: null })).category
    ).toBe("not_ready");
    expect(
      classifyProductionEligibility(candidate({ hasCurrentDocument: false }))
        .category
    ).toBe("not_ready");
  });

  it("classifies a cancelled or suppressed registration first", () => {
    expect(
      classifyProductionEligibility(
        candidate({ registrationStatus: "cancelled", email: null })
      ).category
    ).toBe("cancelled_or_suppressed");
    expect(
      classifyProductionEligibility(candidate({ suppressed: true })).category
    ).toBe("cancelled_or_suppressed");
  });

  it("marks a failed production delivery as retry eligible, not initial", () => {
    const decision = classifyProductionEligibility(
      candidate({ productionFailed: true })
    );
    expect(decision.category).not.toBe("eligible_initial");
    expect(decision.retryEligible).toBe(true);
  });

  it("summarises a mixed cohort into buckets that add up", () => {
    const inputs = [
      candidate({ registrationId: "r1" }),
      candidate({ registrationId: "r2", productionSent: true }),
      candidate({ registrationId: "r3", externallySent: true }),
      candidate({ registrationId: "r4", email: "" }),
      candidate({ registrationId: "r5", inOpenProductionBatch: true }),
      candidate({ registrationId: "r6", registrationStatus: "cancelled" }),
      candidate({ registrationId: "r7", ticketStatus: "revoked" }),
      candidate({ registrationId: "r8", hasCurrentDocument: false }),
    ];
    const { summary, decisions } = summarizeProductionEligibility(inputs);

    expect(summary.totalRegistrations).toBe(8);
    expect(summary.eligibleForInitial).toBe(1);
    expect(summary.alreadyProductionSent).toBe(1);
    expect(summary.previouslySentExternally).toBe(1);
    expect(summary.invalidEmail).toBe(1);
    expect(summary.inOpenProductionBatch).toBe(1);
    expect(summary.cancelledOrSuppressed).toBe(1);
    expect(summary.replacementRequired).toBe(1);
    expect(summary.notReady).toBe(1);

    const bucketed =
      summary.eligibleForInitial +
      summary.alreadyProductionSent +
      summary.previouslySentExternally +
      summary.invalidEmail +
      summary.inOpenProductionBatch +
      summary.cancelledOrSuppressed +
      summary.replacementRequired +
      summary.notReady;
    expect(bucketed).toBe(summary.totalRegistrations);
    expect(decisions).toHaveLength(8);
  });

  it("selects only eligible-initial rows for an initial batch", () => {
    const { decisions } = summarizeProductionEligibility([
      candidate({ registrationId: "r1" }),
      candidate({ registrationId: "r2", productionSent: true }),
      candidate({ registrationId: "r3", externallySent: true }),
    ]);
    const selected = selectInitialBatchCandidates(decisions);
    expect(selected.map((d) => d.registrationId)).toEqual(["r1"]);
  });

  it("selects failed deliveries for a retry batch", () => {
    const { decisions } = summarizeProductionEligibility([
      candidate({ registrationId: "r1" }),
      candidate({ registrationId: "r2", productionFailed: true }),
    ]);
    expect(selectRetryCandidates(decisions).map((d) => d.registrationId)).toEqual([
      "r2",
    ]);
  });

  it("reports registrations that would sit in two open batches for one purpose", () => {
    const open = new Map([["initial", new Set(["r2", "r3"])]]);
    expect(findOpenBatchCollisions(["r1", "r2"], open, "initial")).toEqual(["r2"]);
    // A different purpose is not a collision.
    expect(findOpenBatchCollisions(["r2"], open, "resend")).toEqual([]);
  });
});

describe("CHECKIN-10A batch preparation purposes", () => {
  const base = {
    mode: "production" as const,
    eventId: "event-1",
    eventIsTest: false,
    allowTestRecipientOverride: false,
    currentTemplateVersion: 1,
    registration: {
      id: "reg-1",
      eventId: "event-1",
      registrationStatus: "eligible",
      email: "synthetic.one@example.test",
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
  };

  it("excludes production-sent registrations from an initial batch", () => {
    const result = evaluateDeliveryEligibility({
      ...base,
      purpose: "initial",
      alreadyProductionSent: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("already_production_sent");
    }
  });

  it("excludes externally-delivered registrations from an initial batch", () => {
    const result = evaluateDeliveryEligibility({
      ...base,
      purpose: "initial",
      previouslySentExternally: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("previously_sent_externally");
    }
  });

  it("deliberately includes those same registrations in a resend batch", () => {
    // Resend exists precisely to reach someone who has already been sent to.
    const result = evaluateDeliveryEligibility({
      ...base,
      purpose: "resend",
      alreadyProductionSent: true,
      previouslySentExternally: true,
    });
    expect(result.ok).toBe(true);
  });

  it("includes them in a replacement batch too", () => {
    const result = evaluateDeliveryEligibility({
      ...base,
      purpose: "replacement",
      alreadyProductionSent: true,
    });
    expect(result.ok).toBe(true);
  });

  it("still excludes a registration held in another open delivery batch", () => {
    // CHECKIN-09C isolation must survive the new purpose rules.
    const result = evaluateDeliveryEligibility({
      ...base,
      purpose: "resend",
      alreadyBatched: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("already_in_delivery_batch");
    }
  });
});
