import { describe, expect, it } from "vitest";

import { mapResultOutcome } from "@/features/distribution/outcome-mapping";

describe("result outcome mapping", () => {
  it("advances a production sent to sent", () => {
    const mapped = mapResultOutcome("sent", "production", "initial");
    expect(mapped.attemptOutcome).toBe("sent");
    expect(mapped.newDeliveryStatus).toBe("sent");
  });

  it("advances a resend batch sent to resent", () => {
    const mapped = mapResultOutcome("sent", "production", "resend");
    expect(mapped.newDeliveryStatus).toBe("resent");
  });

  it("never marks a production delivery sent from a test_sent", () => {
    const mapped = mapResultOutcome("test_sent", "production", "initial");
    expect(mapped.attemptOutcome).toBe("sent");
    expect(mapped.attemptMode).toBe("test");
    expect(mapped.newDeliveryStatus).toBeNull();
  });

  it("records a test-mode sent as a test attempt only", () => {
    const mapped = mapResultOutcome("sent", "test", "initial");
    expect(mapped.attemptMode).toBe("test");
    expect(mapped.newDeliveryStatus).toBeNull();
  });

  it("maps failed to a failed delivery for production", () => {
    const mapped = mapResultOutcome("failed", "production", "initial");
    expect(mapped.attemptOutcome).toBe("failed");
    expect(mapped.newDeliveryStatus).toBe("failed");
  });

  it("maps bounce_detected to a bounce_detected delivery", () => {
    const mapped = mapResultOutcome("bounce_detected", "production", "initial");
    expect(mapped.newDeliveryStatus).toBe("bounce_detected");
  });

  it("leaves a skipped delivery unchanged", () => {
    const mapped = mapResultOutcome("skipped", "production", "initial");
    expect(mapped.newDeliveryStatus).toBeNull();
  });

  it("maps cancelled to a cancelled delivery", () => {
    const mapped = mapResultOutcome("cancelled", "production", "initial");
    expect(mapped.newDeliveryStatus).toBe("cancelled");
  });
});
