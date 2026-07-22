/**
 * Pure display-label derivation for distribution outcomes.
 *
 * The database records an attempt as (mode, outcome). The interface must never
 * collapse the two: a `test` attempt with outcome `sent` is "Test sent" and is
 * never shown as, or counted toward, "Production sent". These helpers are the
 * single source of truth for that separation, so the dashboard, batch details
 * and attempt history all label an attempt the same way.
 */

import type { DeliveryAttemptOutcome, DeliveryMode } from "./constants";

/** A stored attempt reduced to the fields display and counting depend on. */
export interface ModeOutcome {
  mode: DeliveryMode;
  outcome: DeliveryAttemptOutcome;
  attemptNumber: number;
}

/**
 * Human label for a single attempt. Test and production sends and failures are
 * always distinguished; other outcomes are mode-neutral.
 */
export function attemptDisplayOutcome(
  mode: DeliveryMode,
  outcome: DeliveryAttemptOutcome
): string {
  switch (outcome) {
    case "sent":
      return mode === "test" ? "Test sent" : "Production sent";
    case "failed":
      return mode === "test" ? "Test failed" : "Production failed";
    case "bounce_detected":
      return "Bounced";
    case "skipped":
      return "Skipped";
    case "cancelled":
      return "Cancelled";
    default: {
      const exhaustive: never = outcome;
      return String(exhaustive);
    }
  }
}

export interface LatestModeOutcomes {
  latestTestOutcome: DeliveryAttemptOutcome | null;
  latestProductionOutcome: DeliveryAttemptOutcome | null;
}

/**
 * Picks the most recent test attempt outcome and the most recent production
 * attempt outcome for one delivery, by highest attempt number. Test and
 * production are resolved independently so a later test attempt can never
 * overwrite a production result or vice versa.
 */
export function deriveLatestModeOutcomes(
  attempts: readonly ModeOutcome[]
): LatestModeOutcomes {
  let latestTest: ModeOutcome | null = null;
  let latestProduction: ModeOutcome | null = null;
  for (const attempt of attempts) {
    if (attempt.mode === "test") {
      if (latestTest === null || attempt.attemptNumber > latestTest.attemptNumber) {
        latestTest = attempt;
      }
    } else if (
      latestProduction === null ||
      attempt.attemptNumber > latestProduction.attemptNumber
    ) {
      latestProduction = attempt;
    }
  }
  return {
    latestTestOutcome: latestTest ? latestTest.outcome : null,
    latestProductionOutcome: latestProduction ? latestProduction.outcome : null,
  };
}
