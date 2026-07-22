/**
 * Pure dashboard-count derivation for the distribution admin surface.
 *
 * Counts are computed from delivery rows and per-delivery latest outcomes so
 * they can be unit tested without a database. The central rule is that test
 * and production are counted independently: "Test sent" is derived only from
 * test attempts and never from a delivery's production status, and "Production
 * sent" is derived only from the production delivery status. A test send never
 * increments a production count. Recipient emails are never included in any
 * summary shape produced here.
 */

import type { DeliveryAttemptOutcome, DeliveryStatus } from "./constants";

export interface DeliveryCountInput {
  status: DeliveryStatus;
  mode: "test" | "production";
  /** Latest test-attempt outcome for this delivery, if any. */
  latestTestOutcome?: DeliveryAttemptOutcome | null;
  /** Latest production-attempt outcome for this delivery, if any. */
  latestProductionOutcome?: DeliveryAttemptOutcome | null;
}

export interface DistributionDashboardCounts {
  totalDeliveries: number;
  prepared: number;
  testSent: number;
  testFailed: number;
  productionSent: number;
  productionFailed: number;
  bounced: number;
  resendRequired: number;
  cancelled: number;
  suppressed: number;
  testDeliveries: number;
  productionDeliveries: number;
}

export function emptyDashboardCounts(): DistributionDashboardCounts {
  return {
    totalDeliveries: 0,
    prepared: 0,
    testSent: 0,
    testFailed: 0,
    productionSent: 0,
    productionFailed: 0,
    bounced: 0,
    resendRequired: 0,
    cancelled: 0,
    suppressed: 0,
    testDeliveries: 0,
    productionDeliveries: 0,
  };
}

export function summarizeDeliveries(
  deliveries: readonly DeliveryCountInput[]
): DistributionDashboardCounts {
  const counts = emptyDashboardCounts();
  for (const delivery of deliveries) {
    counts.totalDeliveries += 1;

    // Test sent/failed come only from the delivery's test attempts, so a
    // successful internal test never touches any production count.
    if (delivery.latestTestOutcome === "sent") {
      counts.testSent += 1;
    } else if (delivery.latestTestOutcome === "failed") {
      counts.testFailed += 1;
    }

    // Production sent/failed and the remaining lifecycle states come from the
    // delivery status, which a test send never advances.
    switch (delivery.status) {
      case "prepared":
        counts.prepared += 1;
        break;
      case "sent":
      case "resent":
        counts.productionSent += 1;
        break;
      case "failed":
        counts.productionFailed += 1;
        break;
      case "bounce_detected":
        counts.bounced += 1;
        break;
      case "resend_required":
        counts.resendRequired += 1;
        break;
      case "cancelled":
        counts.cancelled += 1;
        break;
      case "suppressed":
        counts.suppressed += 1;
        break;
    }

    if (delivery.mode === "test") {
      counts.testDeliveries += 1;
    } else {
      counts.productionDeliveries += 1;
    }
  }
  return counts;
}
