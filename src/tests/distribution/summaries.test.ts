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
  it("tallies statuses and modes", () => {
    const counts = summarizeDeliveries([
      { status: "prepared", mode: "test" },
      { status: "sent", mode: "production" },
      { status: "sent", mode: "production" },
      { status: "bounce_detected", mode: "production" },
      { status: "cancelled", mode: "test" },
    ]);
    expect(counts.prepared).toBe(1);
    expect(counts.sent).toBe(2);
    expect(counts.bounceDetected).toBe(1);
    expect(counts.cancelled).toBe(1);
    expect(counts.testDeliveries).toBe(2);
    expect(counts.productionDeliveries).toBe(3);
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
