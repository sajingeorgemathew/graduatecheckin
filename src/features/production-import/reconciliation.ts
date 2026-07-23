/**
 * Duplicate and guest-order reconciliation.
 *
 * The critical business rule of this release: a repeated graduate row is
 * NOT automatically a duplicate. Three different things look alike in the
 * workbook and must be told apart.
 *
 *  1. Duplicate graduate submission - the same graduate submitting the RSVP
 *     twice with no guest, no child and no payment difference. These are
 *     offered for consolidation into one registration and one ticket, and
 *     every source order ID is still retained.
 *
 *  2. Supplemental guest order - a further transaction adding or changing a
 *     guest, a child or a payment. This is a real, separate source order.
 *     It is preserved and merged into the same graduate's approved party.
 *     It never creates a second registration and never a second ticket.
 *
 *  3. Genuinely different people sharing one email address. These are never
 *     silently merged; the administrator decides.
 *
 * Entitlement rules applied here:
 *  - an adult guest needs a matching payment or an explicit administrator
 *    approval,
 *  - a child aged 5-10 needs a matching payment or an explicit approval,
 *  - a child aged 0-4 may be free but must have been explicitly selected,
 *  - an identical guest name repeated across orders is counted once,
 *  - a cell that looks like it holds several people is never split,
 *  - repeated child counts are never blindly added together.
 *
 * Everything here is a pure function over already-normalized rows, so the
 * whole rule set is unit testable without a database or a workbook.
 */

import {
  MAX_ADULT_GUESTS,
  MAX_CHILDREN_PER_GROUP,
  MAX_COMBINED_CHILDREN,
  noteIndicatesGuestUpdate,
} from "./constants";
import type {
  ClassifiedOrder,
  OrderRole,
  ParsedRows,
  ReconciledGraduate,
  ReconciliationResult,
  ReviewReason,
  ReviewReasonCode,
  SourceOrder,
} from "./types";

// ---------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------

/** Case- and spacing-insensitive comparison key for a person's name. */
export function nameKey(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[.,'’-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Order-insensitive key, so "Priya Raman" and "Raman Priya" are recognized
 * as the same person's name written in a different order. This groups them
 * for review; it never merges them without an administrator saying so.
 */
export function nameSortKey(value: string | null | undefined): string {
  const key = nameKey(value);
  if (key.length === 0) {
    return "";
  }
  return key.split(" ").sort().join(" ");
}

export function emailKey(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------
// Guest-content detection
// ---------------------------------------------------------------------

/** True when the order records any money at all. */
export function hasPayment(order: SourceOrder): boolean {
  return order.orderTotal > 0 || order.feeTotal > 0 || order.taxTotal > 0;
}

/**
 * True when the row carries guest content of any kind. Such a row is a real
 * source transaction and is never treated as a duplicate submission, even
 * when the graduate name and email repeat exactly.
 */
export function carriesGuestContent(order: SourceOrder): boolean {
  return (
    order.guest1Name !== null ||
    order.guest2Name !== null ||
    order.kids04 > 0 ||
    order.kids510 > 0 ||
    hasPayment(order) ||
    noteIndicatesGuestUpdate(order.note)
  );
}

/**
 * Fields that make two otherwise-identical zero-guest rows meaningfully
 * different. A difference here does not create a second registration, but
 * it does mean the administrator must confirm which value is correct.
 */
function contactSignature(order: SourceOrder): string {
  return [
    nameKey(order.graduateFullName),
    emailKey(order.email),
    (order.phone ?? "").trim(),
    (order.gownSize ?? "").trim().toLowerCase(),
    (order.namePronunciation ?? "").trim().toLowerCase(),
  ].join("|");
}

// ---------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------

export interface Grouping {
  groupKey: string;
  orders: SourceOrder[];
  /** True when another graduate name shares this email address. */
  sharesEmailWithOtherName: boolean;
}

/**
 * Groups rows into candidate graduates.
 *
 * Rows are grouped by email first, because the same graduate re-submitting
 * an RSVP always reuses their address. Inside an email, rows are subgrouped
 * by an order-insensitive name key, so a name-order variation stays
 * together while a materially different name becomes its own candidate.
 * When two names share one email neither candidate is merged into the
 * other: both are flagged for an administrator decision.
 *
 * A row with no email falls back to grouping by name alone.
 */
export function groupSourceOrders(
  orders: readonly SourceOrder[]
): Grouping[] {
  const byEmail = new Map<string, SourceOrder[]>();
  const withoutEmail: SourceOrder[] = [];

  for (const order of orders) {
    const email = emailKey(order.email);
    if (email.length === 0) {
      withoutEmail.push(order);
      continue;
    }
    const bucket = byEmail.get(email) ?? [];
    bucket.push(order);
    byEmail.set(email, bucket);
  }

  const groups: Grouping[] = [];

  for (const [email, bucket] of byEmail) {
    const byName = new Map<string, SourceOrder[]>();
    for (const order of bucket) {
      const key = nameSortKey(order.graduateFullName);
      const names = byName.get(key) ?? [];
      names.push(order);
      byName.set(key, names);
    }
    const sharesEmail = byName.size > 1;
    for (const [key, groupOrders] of byName) {
      groups.push({
        groupKey: `email:${email}|name:${key}`,
        orders: groupOrders,
        sharesEmailWithOtherName: sharesEmail,
      });
    }
  }

  const byNameOnly = new Map<string, SourceOrder[]>();
  for (const order of withoutEmail) {
    const key = nameSortKey(order.graduateFullName);
    const names = byNameOnly.get(key) ?? [];
    names.push(order);
    byNameOnly.set(key, names);
  }
  for (const [key, groupOrders] of byNameOnly) {
    groups.push({
      groupKey: `name:${key}`,
      orders: groupOrders,
      sharesEmailWithOtherName: false,
    });
  }

  return groups;
}

// ---------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------

function sortOrders(orders: readonly SourceOrder[]): SourceOrder[] {
  return [...orders].sort((a, b) => {
    const aDate = a.sourceOrderDate ?? "";
    const bDate = b.sourceOrderDate ?? "";
    if (aDate !== bDate) {
      return aDate < bDate ? -1 : 1;
    }
    return a.sourceRowNumber - b.sourceRowNumber;
  });
}

/**
 * Assigns a role to every order in one graduate group.
 *
 * The earliest order is the graduate's primary RSVP. A later order that
 * carries guest content is a supplemental guest transaction and is kept as
 * a separate source order. A later order carrying nothing new is a likely
 * duplicate submission, offered for consolidation.
 */
export function classifyOrders(
  orders: readonly SourceOrder[]
): ClassifiedOrder[] {
  const sorted = sortOrders(orders);
  return sorted.map((order, index) => {
    let role: OrderRole;
    if (index === 0) {
      role = "primary";
    } else if (carriesGuestContent(order)) {
      role = "supplemental";
    } else {
      role = "duplicate_submission";
    }
    return { order, role };
  });
}

// ---------------------------------------------------------------------
// Entitlement
// ---------------------------------------------------------------------

interface ChildResolution {
  count: number;
  conflicting: boolean;
  explicit: boolean;
}

/**
 * Resolves one child group across several orders.
 *
 * Counts are never summed: two rows each recording "1 child" describe the
 * same child recorded twice far more often than two children. Distinct
 * non-zero counts are a conflict the administrator resolves.
 */
export function resolveChildCount(
  counts: readonly { count: number; explicit: boolean }[]
): ChildResolution {
  const nonZero = counts.filter((entry) => entry.count > 0);
  if (nonZero.length === 0) {
    return { count: 0, conflicting: false, explicit: false };
  }
  const distinct = [...new Set(nonZero.map((entry) => entry.count))];
  return {
    count: Math.max(...distinct),
    conflicting: distinct.length > 1,
    explicit: nonZero.some((entry) => entry.explicit),
  };
}

/**
 * Collects distinct adult guest names across every order in the group. An
 * identical name repeated across a duplicate or supplemental order is
 * counted once. Names are never split on a comma or an ampersand: a cell
 * that looks like it holds several people is reported instead.
 */
export function collectAdultGuestNames(orders: readonly SourceOrder[]): {
  names: string[];
  ambiguousCells: number;
  repeatedNames: number;
} {
  const seen = new Map<string, string>();
  let ambiguousCells = 0;
  let repeatedNames = 0;

  for (const order of orders) {
    const ambiguous = order.warnings.filter(
      (warning) => warning.code === "multiple_guest_names"
    ).length;
    ambiguousCells += ambiguous;

    for (const raw of [order.guest1Name, order.guest2Name]) {
      if (raw === null) {
        continue;
      }
      const key = nameSortKey(raw);
      if (key.length === 0) {
        continue;
      }
      if (seen.has(key)) {
        repeatedNames += 1;
        continue;
      }
      seen.set(key, raw);
    }
  }

  return {
    names: [...seen.values()],
    ambiguousCells,
    repeatedNames,
  };
}

const REVIEW_MESSAGES: Record<ReviewReasonCode, string> = {
  same_email_different_name:
    "This email address appears with a materially different graduate name. " +
    "Confirm whether this is one graduate whose name was written " +
    "differently, two graduates sharing an address, or an incorrect row.",
  unpaid_adult_guest:
    "An adult guest is recorded with no supporting guest payment. Confirm " +
    "the payment or approve the guest explicitly before applying.",
  unpaid_child_5_10:
    "A child aged 5 to 10 is recorded with no supporting child payment. " +
    "Confirm the payment or approve the child explicitly before applying.",
  unconfirmed_child_0_4:
    "A child aged 0 to 4 is implied but was not explicitly selected. " +
    "Children aged 0 to 4 may attend free, but must be confirmed.",
  ambiguous_guest_cell:
    "A guest cell appears to contain more than one person. Guest names are " +
    "never split automatically. Enter the approved guest names.",
  repeated_guest_name:
    "The same guest name appears on more than one source order. It has " +
    "been counted once. Confirm the approved guest count.",
  conflicting_child_counts:
    "Source orders record different child counts. Counts are never added " +
    "together. Confirm the approved child counts.",
  guest_count_exceeds_maximum:
    "The recorded party exceeds the permitted maximum of two adult guests " +
    "and two children in total. Confirm the approved party.",
  conflicting_contact_details:
    "Repeated submissions record different contact or gown details. " +
    "Confirm the correct values before applying.",
  missing_email:
    "No email address is recorded, so no ticket email can be sent. The " +
    "graduate can still be checked in at the ceremony.",
  row_validation_warning:
    "A source row raised a validation warning. Review the row before " +
    "applying.",
};

function reason(code: ReviewReasonCode, blocking: boolean): ReviewReason {
  return { code, message: REVIEW_MESSAGES[code], blocking };
}

// ---------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------

function pickCanonicalName(orders: readonly SourceOrder[]): string {
  // Prefer the spelling used most often, then the earliest row, so the
  // canonical name is stable across repeated imports of the same workbook.
  const counts = new Map<string, { name: string; count: number }>();
  for (const order of orders) {
    const key = nameKey(order.graduateFullName);
    const entry = counts.get(key);
    if (entry === undefined) {
      counts.set(key, { name: order.graduateFullName, count: 1 });
    } else {
      entry.count += 1;
    }
  }
  let best: { name: string; count: number } | null = null;
  for (const entry of counts.values()) {
    if (best === null || entry.count > best.count) {
      best = entry;
    }
  }
  return best?.name ?? orders[0].graduateFullName;
}

function firstNonEmpty(
  orders: readonly SourceOrder[],
  read: (order: SourceOrder) => string | null
): string | null {
  for (const order of orders) {
    const value = read(order);
    if (value !== null && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

/** Reconciles one group of orders into a single graduate. */
export function reconcileGroup(group: Grouping): ReconciledGraduate {
  const classified = classifyOrders(group.orders);
  const ordered = classified.map((entry) => entry.order);
  const reasons: ReviewReason[] = [];

  const guests = collectAdultGuestNames(ordered);
  const children04 = resolveChildCount(
    ordered.map((order) => ({
      count: order.kids04,
      explicit: order.kids04Explicit,
    }))
  );
  const children510 = resolveChildCount(
    ordered.map((order) => ({
      count: order.kids510,
      explicit: order.kids510Explicit,
    }))
  );

  // Money across separate transactions genuinely adds up; guest counts do
  // not. Supplemental guest payments are summed with the primary order.
  const feeTotal = roundMoney(
    ordered.reduce((sum, order) => sum + order.feeTotal, 0)
  );
  const taxTotal = roundMoney(
    ordered.reduce((sum, order) => sum + order.taxTotal, 0)
  );
  const orderTotal = roundMoney(
    ordered.reduce((sum, order) => sum + order.orderTotal, 0)
  );
  const groupHasPayment = orderTotal > 0 || feeTotal > 0;

  const proposedAdultGuests = guests.names.length;
  const proposedChildren04 = children04.count;
  const proposedChildren510 = children510.count;

  if (group.sharesEmailWithOtherName) {
    reasons.push(reason("same_email_different_name", true));
  }
  if (guests.ambiguousCells > 0) {
    reasons.push(reason("ambiguous_guest_cell", true));
  }
  if (guests.repeatedNames > 0) {
    reasons.push(reason("repeated_guest_name", true));
  }
  if (children04.conflicting || children510.conflicting) {
    reasons.push(reason("conflicting_child_counts", true));
  }

  // Payment-backed entitlement. Nothing is approved on the strength of the
  // workbook alone when no payment supports it.
  let approvedAdultGuests = proposedAdultGuests;
  if (proposedAdultGuests > 0 && !groupHasPayment) {
    reasons.push(reason("unpaid_adult_guest", true));
    approvedAdultGuests = 0;
  }

  let approvedChildren510 = proposedChildren510;
  if (proposedChildren510 > 0 && !groupHasPayment) {
    reasons.push(reason("unpaid_child_5_10", true));
    approvedChildren510 = 0;
  }

  // Children aged 0-4 may attend free, but only when explicitly selected.
  let approvedChildren04 = proposedChildren04;
  if (proposedChildren04 > 0 && !children04.explicit) {
    reasons.push(reason("unconfirmed_child_0_4", true));
    approvedChildren04 = 0;
  }

  if (
    proposedAdultGuests > MAX_ADULT_GUESTS ||
    proposedChildren04 > MAX_CHILDREN_PER_GROUP ||
    proposedChildren510 > MAX_CHILDREN_PER_GROUP ||
    proposedChildren04 + proposedChildren510 > MAX_COMBINED_CHILDREN
  ) {
    reasons.push(reason("guest_count_exceeds_maximum", true));
  }

  // Approved counts are clamped to what a registration can legally hold.
  // The blocking reason above still stops the group being applied unedited.
  approvedAdultGuests = Math.min(approvedAdultGuests, MAX_ADULT_GUESTS);
  approvedChildren04 = Math.min(approvedChildren04, MAX_CHILDREN_PER_GROUP);
  approvedChildren510 = Math.min(approvedChildren510, MAX_CHILDREN_PER_GROUP);
  if (approvedChildren04 + approvedChildren510 > MAX_COMBINED_CHILDREN) {
    approvedChildren510 = Math.max(
      0,
      MAX_COMBINED_CHILDREN - approvedChildren04
    );
  }

  // Repeated zero-guest submissions that disagree about contact details.
  const duplicates = classified.filter(
    (entry) => entry.role === "duplicate_submission"
  );
  if (duplicates.length > 0) {
    const signatures = new Set(ordered.map(contactSignature));
    if (signatures.size > 1) {
      reasons.push(reason("conflicting_contact_details", true));
    }
  }

  if (ordered.some((order) => order.errors.length > 0)) {
    reasons.push(reason("row_validation_warning", true));
  }

  const email = firstNonEmpty(ordered, (order) => order.email);
  if (email === null) {
    reasons.push(reason("missing_email", false));
  }

  const primary =
    classified.find((entry) => entry.role === "primary")?.order ?? ordered[0];

  return {
    groupKey: group.groupKey,
    canonicalFullName: pickCanonicalName(ordered),
    email,
    phone: firstNonEmpty(ordered, (order) => order.phone),
    gownSize: firstNonEmpty(ordered, (order) => order.gownSize),
    namePronunciation: firstNonEmpty(
      ordered,
      (order) => order.namePronunciation
    ),
    approvedAdultGuests,
    approvedChildren04,
    approvedChildren510,
    approvedAdultGuestNames: guests.names.slice(0, approvedAdultGuests),
    proposedAdultGuests,
    proposedChildren04,
    proposedChildren510,
    feeTotal,
    taxTotal,
    orderTotal,
    primarySourceOrderId: primary.sourceOrderId,
    orders: classified,
    decision: reasons.some((entry) => entry.blocking)
      ? "needs_review"
      : "approved",
    reviewReasons: reasons,
  };
}

/**
 * Reconciles a whole workbook. The result is a proposal only: nothing is
 * written and no ticket exists until the administrator applies the import.
 */
export function reconcileWorkbook(parsed: ParsedRows): ReconciliationResult {
  const graduates = groupSourceOrders(parsed.orders)
    .map(reconcileGroup)
    .sort((a, b) => a.canonicalFullName.localeCompare(b.canonicalFullName));

  const notices: ReconciliationResult["notices"] = [];

  const duplicateCount = graduates.reduce(
    (total, graduate) =>
      total +
      graduate.orders.filter((entry) => entry.role === "duplicate_submission")
        .length,
    0
  );
  if (duplicateCount > 0) {
    notices.push({
      code: "duplicate_submissions_detected",
      message:
        `${duplicateCount} repeated submission row(s) carry no guest, no ` +
        "child and no payment difference. They are proposed for " +
        "consolidation and every source order ID is retained.",
    });
  }

  const supplementalCount = graduates.reduce(
    (total, graduate) =>
      total +
      graduate.orders.filter((entry) => entry.role === "supplemental").length,
    0
  );
  if (supplementalCount > 0) {
    notices.push({
      code: "supplemental_orders_detected",
      message:
        `${supplementalCount} supplemental guest order(s) were preserved ` +
        "and merged into an existing graduate. They create no second " +
        "registration and no second ticket.",
    });
  }

  return { graduates, rejected: parsed.rejected, notices };
}

/** Derived counts for the import header record and the preview summary. */
export function countReconciliation(
  result: ReconciliationResult
): import("./types").ProductionImportCounts {
  let duplicateSubmissionCount = 0;
  let supplementalOrderCount = 0;
  let sourceOrderCount = 0;
  let needsReviewCount = 0;
  let excludedCount = 0;
  let expectedTicketCount = 0;

  for (const graduate of result.graduates) {
    sourceOrderCount += graduate.orders.length;
    for (const entry of graduate.orders) {
      if (entry.role === "duplicate_submission") {
        duplicateSubmissionCount += 1;
      } else if (entry.role === "supplemental") {
        supplementalOrderCount += 1;
      }
    }
    if (graduate.decision === "needs_review") {
      needsReviewCount += 1;
    } else if (graduate.decision === "excluded") {
      excludedCount += 1;
    }
    if (graduate.decision !== "excluded") {
      // One reconciled graduate always produces exactly one ticket.
      expectedTicketCount += 1;
    }
  }

  return {
    sourceOrderCount: sourceOrderCount + result.rejected.length,
    graduateCount: result.graduates.length,
    duplicateSubmissionCount,
    supplementalOrderCount,
    needsReviewCount,
    excludedCount,
    expectedTicketCount,
  };
}
