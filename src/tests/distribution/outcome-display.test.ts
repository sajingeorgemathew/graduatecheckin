/**
 * Test/production display separation. A test send is labelled "Test sent" and
 * never "Production sent", and the latest test and production outcomes are
 * resolved independently so one mode can never overwrite the other.
 */

import { describe, expect, it } from "vitest";

import {
  attemptDisplayOutcome,
  deriveLatestModeOutcomes,
  type ModeOutcome,
} from "@/features/distribution/outcome-display";

describe("attemptDisplayOutcome", () => {
  it("labels a test send as Test sent, never Production sent", () => {
    expect(attemptDisplayOutcome("test", "sent")).toBe("Test sent");
    expect(attemptDisplayOutcome("test", "sent")).not.toBe("Production sent");
  });

  it("labels a production send as Production sent", () => {
    expect(attemptDisplayOutcome("production", "sent")).toBe("Production sent");
  });

  it("distinguishes test and production failures", () => {
    expect(attemptDisplayOutcome("test", "failed")).toBe("Test failed");
    expect(attemptDisplayOutcome("production", "failed")).toBe(
      "Production failed"
    );
  });

  it("labels mode-neutral outcomes", () => {
    expect(attemptDisplayOutcome("production", "bounce_detected")).toBe("Bounced");
    expect(attemptDisplayOutcome("test", "cancelled")).toBe("Cancelled");
    expect(attemptDisplayOutcome("production", "skipped")).toBe("Skipped");
  });
});

describe("deriveLatestModeOutcomes", () => {
  it("picks the highest-numbered attempt for each mode independently", () => {
    const attempts: ModeOutcome[] = [
      { mode: "test", outcome: "failed", attemptNumber: 1 },
      { mode: "test", outcome: "sent", attemptNumber: 2 },
      { mode: "production", outcome: "sent", attemptNumber: 3 },
    ];
    const latest = deriveLatestModeOutcomes(attempts);
    expect(latest.latestTestOutcome).toBe("sent");
    expect(latest.latestProductionOutcome).toBe("sent");
  });

  it("keeps production null when only test attempts exist", () => {
    const latest = deriveLatestModeOutcomes([
      { mode: "test", outcome: "sent", attemptNumber: 1 },
    ]);
    expect(latest.latestTestOutcome).toBe("sent");
    expect(latest.latestProductionOutcome).toBeNull();
  });

  it("returns nulls for an empty history", () => {
    const latest = deriveLatestModeOutcomes([]);
    expect(latest.latestTestOutcome).toBeNull();
    expect(latest.latestProductionOutcome).toBeNull();
  });
});
