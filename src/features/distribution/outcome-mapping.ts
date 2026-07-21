/**
 * Pure mapping from an imported result outcome to the append-only attempt
 * outcome and the resulting delivery status.
 *
 * The central safety rule lives here: a `test_sent` result is recorded as a
 * test attempt only and never advances a production delivery to `sent`. A
 * send success is `sent`, which means the provider accepted the message, not
 * that it reached an inbox — there is deliberately no `delivered` status.
 */

import type {
  DeliveryAttemptOutcome,
  DeliveryMode,
  DeliveryStatus,
  ResultOutcome,
} from "./types";

export interface MappedResult {
  attemptOutcome: DeliveryAttemptOutcome;
  /** The mode recorded on the attempt (test attempts stay test). */
  attemptMode: DeliveryMode;
  /** Null leaves the delivery status unchanged. */
  newDeliveryStatus: DeliveryStatus | null;
}

export function mapResultOutcome(
  outcome: ResultOutcome,
  mode: DeliveryMode,
  purpose: "initial" | "updated" | "replacement" | "resend"
): MappedResult {
  switch (outcome) {
    case "test_sent":
      // Always a test attempt; the production delivery is never marked sent.
      return {
        attemptOutcome: "sent",
        attemptMode: "test",
        newDeliveryStatus: null,
      };
    case "sent": {
      if (mode === "test") {
        return {
          attemptOutcome: "sent",
          attemptMode: "test",
          newDeliveryStatus: null,
        };
      }
      // A resend batch advances to `resent`; otherwise to `sent`.
      return {
        attemptOutcome: "sent",
        attemptMode: "production",
        newDeliveryStatus: purpose === "resend" ? "resent" : "sent",
      };
    }
    case "failed":
      return {
        attemptOutcome: "failed",
        attemptMode: mode,
        newDeliveryStatus: mode === "production" ? "failed" : null,
      };
    case "bounce_detected":
      return {
        attemptOutcome: "bounce_detected",
        attemptMode: mode,
        newDeliveryStatus: "bounce_detected",
      };
    case "skipped":
      return {
        attemptOutcome: "skipped",
        attemptMode: mode,
        newDeliveryStatus: null,
      };
    case "cancelled":
      return {
        attemptOutcome: "cancelled",
        attemptMode: mode,
        newDeliveryStatus: "cancelled",
      };
    default: {
      const exhaustive: never = outcome;
      throw new Error(`Unhandled result outcome: ${String(exhaustive)}`);
    }
  }
}
