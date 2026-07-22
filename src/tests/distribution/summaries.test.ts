import { describe, expect, it } from "vitest";

import { summarizeDeliveries } from "@/features/distribution/summaries";
import {
  generateAttemptReference,
  generateDeliveryBatchCode,
  generateDeliveryReference,
  maskEmail,
} from "@/features/distribution/references";
import {
  DELIVERY_BATCH_CODE_PATTERN,
  DELIVERY_REFERENCE_PATTERN,
} from "@/features/distribution/references";

describe("delivery summaries", () => {
  it("counts test and production independently", () => {
    const counts = summarizeDeliveries([
      // A test batch delivery whose test send succeeded. Its delivery status
      // stays prepared because a test never advances production status.
      { status: "prepared", mode: "test", latestTestOutcome: "sent" },
      // A production delivery that has been sent.
      { status: "sent", mode: "production", latestProductionOutcome: "sent" },
      { status: "sent", mode: "production", latestProductionOutcome: "sent" },
      { status: "bounce_detected", mode: "production" },
      { status: "cancelled", mode: "test", latestTestOutcome: "failed" },
    ]);

    expect(counts.totalDeliveries).toBe(5);
    expect(counts.testSent).toBe(1);
    expect(counts.testFailed).toBe(1);
    expect(counts.productionSent).toBe(2);
    expect(counts.productionFailed).toBe(0);
    expect(counts.bounced).toBe(1);
    expect(counts.cancelled).toBe(1);
    expect(counts.testDeliveries).toBe(2);
    expect(counts.productionDeliveries).toBe(3);
  });

  it("never lets a test send increment a production count", () => {
    const counts = summarizeDeliveries([
      { status: "prepared", mode: "test", latestTestOutcome: "sent" },
      { status: "prepared", mode: "test", latestTestOutcome: "sent" },
    ]);
    expect(counts.testSent).toBe(2);
    expect(counts.productionSent).toBe(0);
    expect(counts.prepared).toBe(2);
  });

  it("counts a resent production delivery as production sent", () => {
    const counts = summarizeDeliveries([
      { status: "resent", mode: "production", latestProductionOutcome: "sent" },
    ]);
    expect(counts.productionSent).toBe(1);
    expect(counts.productionFailed).toBe(0);
  });

  it("returns all-zero counts for no deliveries", () => {
    const counts = summarizeDeliveries([]);
    expect(counts.totalDeliveries).toBe(0);
    expect(counts.testSent).toBe(0);
    expect(counts.productionSent).toBe(0);
  });
});

describe("references and masking", () => {
  it("generates unique delivery references matching the pattern", () => {
    const values = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const reference = generateDeliveryReference();
      expect(DELIVERY_REFERENCE_PATTERN.test(reference)).toBe(true);
      values.add(reference);
    }
    expect(values.size).toBe(200);
  });

  it("generates unique attempt references", () => {
    const values = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      values.add(generateAttemptReference());
    }
    expect(values.size).toBe(200);
  });

  it("generates a well-formed batch code", () => {
    expect(DELIVERY_BATCH_CODE_PATTERN.test(generateDeliveryBatchCode())).toBe(
      true
    );
  });

  it("masks an email for list views", () => {
    const masked = maskEmail("graduate@example.com");
    expect(masked).toContain("@example.com");
    expect(masked).not.toContain("graduate@");
    expect(masked.startsWith("g")).toBe(true);
  });

  it("masks an empty email safely", () => {
    expect(maskEmail("")).toBe("");
    expect(maskEmail(null)).toBe("");
  });
});
