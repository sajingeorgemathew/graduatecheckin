/**
 * CHECKIN-10A production eligibility rules.
 *
 * Pure classification of every registration in the production event into
 * exactly one primary bucket, plus the derived "can be resent" and "can be
 * retried" sets. This is what the eligibility preview shows before an
 * administrator prepares a production batch, and it is what keeps an initial
 * batch from ever re-sending someone who has already received their ticket.
 *
 * No database access, no email, no secrets: the read model gathers the facts
 * and this module decides what they mean.
 */

import { isValidEmail } from "./constants";

/** The facts the read model gathers for one registration. */
export interface ProductionEligibilityInput {
  registrationId: string;
  graduateName: string;
  /** Registration lifecycle status, e.g. 'eligible' or 'cancelled'. */
  registrationStatus: string;
  email: string | null;
  /** Status of the registration's current ticket, null when there is none. */
  ticketStatus: string | null;
  /** True when a current, distributable PDF document exists. */
  hasCurrentDocument: boolean;
  /** A production attempt has already been recorded as sent for this graduate. */
  productionSent: boolean;
  /** A previous delivery outside this system has been recorded. */
  externallySent: boolean;
  /** The registration sits in a production batch that is still open. */
  inOpenProductionBatch: boolean;
  /** The latest production delivery failed or bounced and can be retried. */
  productionFailed: boolean;
  /** The delivery was cancelled or suppressed by an administrator. */
  suppressed: boolean;
}

export const PRODUCTION_ELIGIBILITY_CATEGORIES = [
  "eligible_initial",
  "already_production_sent",
  "previously_sent_externally",
  "invalid_email",
  "in_open_production_batch",
  "cancelled_or_suppressed",
  "replacement_required",
  "not_ready",
] as const;
export type ProductionEligibilityCategory =
  (typeof PRODUCTION_ELIGIBILITY_CATEGORIES)[number];

export const PRODUCTION_ELIGIBILITY_LABELS: Record<
  ProductionEligibilityCategory,
  string
> = {
  eligible_initial: "Eligible for initial delivery",
  already_production_sent: "Already production sent",
  previously_sent_externally: "Previously sent outside the system",
  invalid_email: "Invalid or missing email",
  in_open_production_batch: "Already in an open production batch",
  cancelled_or_suppressed: "Cancelled or suppressed",
  replacement_required: "Replacement required",
  not_ready: "No current ticket or PDF yet",
};

export interface ProductionEligibilityDecision {
  registrationId: string;
  graduateName: string;
  category: ProductionEligibilityCategory;
  /** A valid ticket exists and the same ticket may be sent again. */
  resendEligible: boolean;
  /** The last production attempt failed, so a retry batch may include it. */
  retryEligible: boolean;
}

/**
 * Classifies one registration. The order of checks is the order of severity:
 * a cancelled registration is never "eligible with a bad email", and a ticket
 * that must be replaced is never quietly resent.
 */
export function classifyProductionEligibility(
  input: ProductionEligibilityInput
): ProductionEligibilityDecision {
  const ticketValid = input.ticketStatus === "active";
  const base = {
    registrationId: input.registrationId,
    graduateName: input.graduateName,
  };

  const decide = (
    category: ProductionEligibilityCategory,
    resendEligible: boolean,
    retryEligible: boolean
  ): ProductionEligibilityDecision => ({
    ...base,
    category,
    resendEligible,
    retryEligible,
  });

  if (
    input.registrationStatus === "cancelled" ||
    input.suppressed ||
    input.registrationStatus !== "eligible"
  ) {
    return decide("cancelled_or_suppressed", false, false);
  }

  // A revoked or replaced ticket cannot be resent; a new ticket must be
  // generated first, which is exactly the replacement purpose.
  if (
    input.ticketStatus === "revoked" ||
    input.ticketStatus === "replaced"
  ) {
    return decide("replacement_required", false, false);
  }

  if (!isValidEmail(input.email)) {
    return decide("invalid_email", false, false);
  }

  if (input.ticketStatus === null || !ticketValid || !input.hasCurrentDocument) {
    return decide("not_ready", false, false);
  }

  // From here the graduate has a valid ticket and a current PDF, so any
  // corrective action is a resend of the same ticket rather than a new one.
  if (input.inOpenProductionBatch) {
    return decide("in_open_production_batch", true, input.productionFailed);
  }
  if (input.productionSent) {
    return decide("already_production_sent", true, input.productionFailed);
  }
  if (input.externallySent) {
    // Recorded prior external delivery removes the graduate from the initial
    // batch but leaves an intentional resend available.
    return decide("previously_sent_externally", true, false);
  }
  if (input.productionFailed) {
    // A failed production attempt is not an initial candidate; it belongs in
    // the failed-delivery retry batch.
    return decide("already_production_sent", true, true);
  }

  return decide("eligible_initial", true, false);
}

export interface ProductionEligibilitySummary {
  totalRegistrations: number;
  eligibleForInitial: number;
  alreadyProductionSent: number;
  previouslySentExternally: number;
  invalidEmail: number;
  inOpenProductionBatch: number;
  cancelledOrSuppressed: number;
  replacementRequired: number;
  notReady: number;
  resendEligible: number;
  retryEligible: number;
}

export function emptyProductionEligibilitySummary(): ProductionEligibilitySummary {
  return {
    totalRegistrations: 0,
    eligibleForInitial: 0,
    alreadyProductionSent: 0,
    previouslySentExternally: 0,
    invalidEmail: 0,
    inOpenProductionBatch: 0,
    cancelledOrSuppressed: 0,
    replacementRequired: 0,
    notReady: 0,
    resendEligible: 0,
    retryEligible: 0,
  };
}

export function summarizeProductionEligibility(
  inputs: readonly ProductionEligibilityInput[]
): {
  summary: ProductionEligibilitySummary;
  decisions: ProductionEligibilityDecision[];
} {
  const summary = emptyProductionEligibilitySummary();
  const decisions: ProductionEligibilityDecision[] = [];

  for (const input of inputs) {
    const decision = classifyProductionEligibility(input);
    decisions.push(decision);
    summary.totalRegistrations += 1;
    if (decision.resendEligible) {
      summary.resendEligible += 1;
    }
    if (decision.retryEligible) {
      summary.retryEligible += 1;
    }
    switch (decision.category) {
      case "eligible_initial":
        summary.eligibleForInitial += 1;
        break;
      case "already_production_sent":
        summary.alreadyProductionSent += 1;
        break;
      case "previously_sent_externally":
        summary.previouslySentExternally += 1;
        break;
      case "invalid_email":
        summary.invalidEmail += 1;
        break;
      case "in_open_production_batch":
        summary.inOpenProductionBatch += 1;
        break;
      case "cancelled_or_suppressed":
        summary.cancelledOrSuppressed += 1;
        break;
      case "replacement_required":
        summary.replacementRequired += 1;
        break;
      case "not_ready":
        summary.notReady += 1;
        break;
    }
  }

  return { summary, decisions };
}

/**
 * The registrations an initial production batch may cover. Anyone already
 * production-sent, already recorded as sent externally, or sitting in another
 * open production batch is excluded by construction.
 */
export function selectInitialBatchCandidates(
  decisions: readonly ProductionEligibilityDecision[]
): ProductionEligibilityDecision[] {
  return decisions.filter(
    (decision) => decision.category === "eligible_initial"
  );
}

/** Registrations a failed-delivery retry batch may cover. */
export function selectRetryCandidates(
  decisions: readonly ProductionEligibilityDecision[]
): ProductionEligibilityDecision[] {
  return decisions.filter((decision) => decision.retryEligible);
}

/**
 * No registration may appear in two open production batches for the same
 * purpose. Returns the registration ids that would collide.
 */
export function findOpenBatchCollisions(
  requested: readonly string[],
  openByPurpose: ReadonlyMap<string, ReadonlySet<string>>,
  purpose: string
): string[] {
  const open = openByPurpose.get(purpose);
  if (open === undefined) {
    return [];
  }
  return requested.filter((id) => open.has(id));
}
