/**
 * Pure dashboard-count derivation for the distribution admin surface.
 *
 * Counts are computed from delivery rows and simple flags so they can be
 * unit tested without a database. Recipient emails are never included in any
 * summary shape produced here.
 */

import type { DeliveryStatus } from "./constants";

export interface DeliveryCountInput {
  status: DeliveryStatus;
  mode: "test" | "production";
}

export interface DistributionDashboardCounts {
  prepared: number;
  sent: number;
  failed: number;
  bounceDetected: number;
  resendRequired: number;
  resent: number;
  cancelled: number;
  suppressed: number;
  testDeliveries: number;
  productionDeliveries: number;
}

export function summarizeDeliveries(
  deliveries: readonly DeliveryCountInput[]
): DistributionDashboardCounts {
  const counts: DistributionDashboardCounts = {
    prepared: 0,
    sent: 0,
    failed: 0,
    bounceDetected: 0,
    resendRequired: 0,
    resent: 0,
    cancelled: 0,
    suppressed: 0,
    testDeliveries: 0,
    productionDeliveries: 0,
  };
  for (const delivery of deliveries) {
    switch (delivery.status) {
      case "prepared":
        counts.prepared += 1;
        break;
      case "sent":
        counts.sent += 1;
        break;
      case "failed":
        counts.failed += 1;
        break;
      case "bounce_detected":
        counts.bounceDetected += 1;
        break;
      case "resend_required":
        counts.resendRequired += 1;
        break;
      case "resent":
        counts.resent += 1;
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

export interface PreparationReadinessInput {
  missingEmail: number;
  invalidEmail: number;
  outdatedPdf: number;
  invalidTicket: number;
}

/** Combines delivery counts with preparation-time exclusion tallies. */
export interface DistributionDashboard extends DistributionDashboardCounts {
  missingEmail: number;
  outdatedPdf: number;
  invalidTicket: number;
}
