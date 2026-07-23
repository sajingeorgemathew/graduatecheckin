/**
 * Adult guest and child allowances are independent.
 *
 * The graduation rules give a graduate up to two adult guests AND up to
 * two children. Approving two adult guests must never reduce the child
 * allowance, and approving two children must never reduce the adult guest
 * allowance. The largest legal party is therefore five people:
 * one graduate + two adult guests + two children.
 *
 * These tests pin that rule down at every layer that can silently narrow
 * it: the migration constraints, the Zod schemas, the reconciliation
 * engine, the printable party snapshot and the personalized email.
 *
 * All data below is synthetic and uses the reserved example.com domain.
 * No real graduate data appears in this repository or in any test.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  MAX_ADULT_GUESTS,
  MAX_CHILDREN_PER_GROUP,
  MAX_COMBINED_CHILDREN,
} from "@/features/production-import/constants";
import { countReconciliation } from "@/features/production-import/reconciliation";
import { reconcileGraduateSchema } from "@/features/production-import/schemas";
import type { ReconciledGraduate } from "@/features/production-import/types";
import { manualRegistrationSchema } from "@/features/registrations/schemas";
import {
  describeEmailParty,
  renderTicketEmail,
  type TicketEmailInput,
} from "@/features/manual-delivery/email-template";
import { buildRegisteredParty } from "@/features/ticket-documents/party";
import { paidRow, reconcileRsvpRows } from "./fixtures";

/** The largest party the graduation rules allow. */
const MAX_TOTAL_PARTY = 5;

function only<T>(values: readonly T[]): T {
  expect(values).toHaveLength(1);
  return values[0];
}

function approvedPartySize(graduate: ReconciledGraduate): number {
  return (
    1 +
    graduate.approvedAdultGuests +
    graduate.approvedChildren04 +
    graduate.approvedChildren510
  );
}

function reasonCodes(graduate: ReconciledGraduate): string[] {
  return graduate.reviewReasons.map((reason) => reason.code);
}

/** A reconcile decision body with the fields a test does not care about. */
function decision(overrides: {
  approvedAdultGuests: number;
  approvedChildren04: number;
  approvedChildren510: number;
  approvedAdultGuestNames?: string[];
}) {
  return {
    decision: "approved" as const,
    approvedAdultGuestNames: [],
    reconciliationNote: "Payment confirmed by the administrator.",
    ...overrides,
  };
}

/** A manual-add body with the fields a test does not care about. */
function manualAdd(overrides: {
  adultGuestCount: number;
  children04: number;
  children510: number;
  adultGuestNames?: string[];
}) {
  return {
    graduateFullName: "Amara Osei",
    email: "amara.osei@example.com",
    source: "late_rsvp" as const,
    adultGuestNames: [],
    paymentNote: "Guest and child fees paid at the office.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// Migration constraints
// ---------------------------------------------------------------------

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

let migration = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_create_manual_production_workflow.sql")
  );
  expect(files).toHaveLength(1);
  migration = readFileSync(join(migrationsDir, files[0]), "utf8")
    .toLowerCase()
    .replace(/\s+/g, " ");
});

describe("migration party constraints", () => {
  it("bounds adult guests and each child group independently", () => {
    expect(migration).toContain("approved_adult_guests between 0 and 2");
    expect(migration).toContain("approved_children_0_4 between 0 and 2");
    expect(migration).toContain("approved_children_5_10 between 0 and 2");
  });

  it("caps children in total but never adults plus children", () => {
    expect(migration).toContain(
      "approved_children_0_4 + approved_children_5_10 <= 2"
    );
    // Adult guests and children are separate allowances. A combined cap
    // would silently forbid the legal maximum party of five.
    expect(migration).not.toContain("approved_adult_guests + approved_child");
    expect(migration).not.toMatch(
      /approved_children?_[0-9_]+ \+ approved_adult_guests/
    );
    expect(migration).not.toContain("adult_guest_count + child_count");
  });
});

// ---------------------------------------------------------------------
// 1, 2, 3, 4, 5, 6: the allowance rules themselves
// ---------------------------------------------------------------------

describe("approved party limits", () => {
  it("accepts two adult guests together with two children", () => {
    const parsed = reconcileGraduateSchema.safeParse(
      decision({
        approvedAdultGuests: 2,
        approvedChildren04: 1,
        approvedChildren510: 1,
        approvedAdultGuestNames: ["Kwame Osei", "Nia Osei"],
      })
    );
    expect(parsed.success).toBe(true);
  });

  it("makes the total party for that case five", () => {
    const result = reconcileRsvpRows([
      paidRow({
        order_id: "5001",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
        "Guest 1 - Full Name": "Kwame Osei",
        "Guest 2 - Full Name": "Nia Osei",
        "Kids (0 to 4)": 1,
        Kids: 1,
      }),
    ]);

    const graduate = only(result.graduates);
    expect(graduate.approvedAdultGuests).toBe(2);
    expect(graduate.approvedChildren04).toBe(1);
    expect(graduate.approvedChildren510).toBe(1);
    expect(approvedPartySize(graduate)).toBe(MAX_TOTAL_PARTY);
    expect(reasonCodes(graduate)).not.toContain("guest_count_exceeds_maximum");
  });

  it("rejects three adult guests", () => {
    const parsed = reconcileGraduateSchema.safeParse(
      decision({
        approvedAdultGuests: 3,
        approvedChildren04: 0,
        approvedChildren510: 0,
      })
    );
    expect(parsed.success).toBe(false);
    expect(MAX_ADULT_GUESTS).toBe(2);
  });

  it("rejects three children in total", () => {
    const parsed = reconcileGraduateSchema.safeParse(
      decision({
        approvedAdultGuests: 0,
        approvedChildren04: 2,
        approvedChildren510: 1,
      })
    );
    expect(parsed.success).toBe(false);
    expect(MAX_COMBINED_CHILDREN).toBe(2);
  });

  it("flags a workbook row carrying three children", () => {
    const result = reconcileRsvpRows([
      paidRow({
        order_id: "5002",
        "Full Name": "Nikhil Varma",
        Email: "nikhil.varma@example.com",
        "Kids (0 to 4)": 2,
        Kids: 1,
      }),
    ]);

    const graduate = only(result.graduates);
    expect(reasonCodes(graduate)).toContain("guest_count_exceeds_maximum");
    expect(graduate.decision).toBe("needs_review");
    // The clamp never exceeds the legal party, whatever the workbook said.
    expect(approvedPartySize(graduate)).toBeLessThanOrEqual(MAX_TOTAL_PARTY);
    expect(
      graduate.approvedChildren04 + graduate.approvedChildren510
    ).toBeLessThanOrEqual(MAX_COMBINED_CHILDREN);
  });

  it("does not let two adult guests reduce the child allowance", () => {
    for (const children of [
      { approvedChildren04: 2, approvedChildren510: 0 },
      { approvedChildren04: 0, approvedChildren510: 2 },
      { approvedChildren04: 1, approvedChildren510: 1 },
    ]) {
      const parsed = reconcileGraduateSchema.safeParse(
        decision({
          approvedAdultGuests: MAX_ADULT_GUESTS,
          approvedAdultGuestNames: ["Kwame Osei", "Nia Osei"],
          ...children,
        })
      );
      expect(parsed.success).toBe(true);
    }
  });

  it("does not let two children reduce the adult guest allowance", () => {
    const parsed = reconcileGraduateSchema.safeParse(
      decision({
        approvedAdultGuests: MAX_ADULT_GUESTS,
        approvedChildren04: 0,
        approvedChildren510: MAX_CHILDREN_PER_GROUP,
        approvedAdultGuestNames: ["Kwame Osei", "Nia Osei"],
      })
    );
    expect(parsed.success).toBe(true);
    expect(MAX_ADULT_GUESTS).toBe(2);
  });
});

// ---------------------------------------------------------------------
// 7, 8, 9: reconciliation still consolidates supplemental orders
// ---------------------------------------------------------------------

describe("supplemental orders at the maximum party", () => {
  it("consolidates a supplemental paid guest order into one graduate", () => {
    const result = reconcileRsvpRows([
      paidRow({
        order_id: "6001",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
        "Guest 1 - Full Name": "Kwame Osei",
        fee_total: 20,
        order_total: 22.6,
      }),
      paidRow({
        order_id: "6002",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
        "Guest 2 - Full Name": "Nia Osei",
        Note: "Adding a second guest, payment attached.",
        fee_total: 20,
        order_total: 22.6,
      }),
    ]);

    const graduate = only(result.graduates);
    expect(graduate.orders.map((entry) => entry.order.sourceOrderId)).toEqual([
      "6001",
      "6002",
    ]);
    expect(graduate.orders.map((entry) => entry.role)).toEqual([
      "primary",
      "supplemental",
    ]);
    expect(graduate.approvedAdultGuests).toBe(2);
    expect(graduate.approvedAdultGuestNames).toEqual([
      "Kwame Osei",
      "Nia Osei",
    ]);
  });

  it("consolidates a supplemental child order into one graduate", () => {
    const result = reconcileRsvpRows([
      paidRow({
        order_id: "7001",
        "Full Name": "Nikhil Varma",
        Email: "nikhil.varma@example.com",
        "Guest 1 - Full Name": "Priya Varma",
        "Guest 2 - Full Name": "Rohan Varma",
      }),
      paidRow({
        order_id: "7002",
        "Full Name": "Nikhil Varma",
        Email: "nikhil.varma@example.com",
        Kids: 2,
        Note: "Adding two children, payment attached.",
      }),
    ]);

    const graduate = only(result.graduates);
    expect(graduate.orders).toHaveLength(2);
    // The supplemental child order never creates a second graduate and
    // never reduces the two adult guests already approved.
    expect(graduate.approvedAdultGuests).toBe(2);
    expect(graduate.approvedChildren510).toBe(2);
    expect(approvedPartySize(graduate)).toBe(MAX_TOTAL_PARTY);
  });

  it("still produces exactly one ticket for the reconciled graduate", () => {
    const result = reconcileRsvpRows([
      paidRow({
        order_id: "8001",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
        "Guest 1 - Full Name": "Kwame Osei",
        "Guest 2 - Full Name": "Nia Osei",
      }),
      paidRow({
        order_id: "8002",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
        Kids: 2,
        Note: "Adding two children, payment attached.",
      }),
    ]);

    const counts = countReconciliation(result);
    expect(counts.graduateCount).toBe(1);
    expect(counts.expectedTicketCount).toBe(1);
    expect(counts.supplementalOrderCount).toBe(1);
  });
});

// ---------------------------------------------------------------------
// 10, 11: the printable party and the personalized email
// ---------------------------------------------------------------------

describe("party snapshot and email at the maximum party", () => {
  const party = buildRegisteredParty(
    {
      graduateFullName: "Amara Osei",
      registeredAdultGuests: 2,
      registeredChildren04: 1,
      registeredChildren510: 1,
    },
    [
      { guestCategory: "adult", guestName: "Kwame Osei", sortOrder: 1 },
      { guestCategory: "adult", guestName: "Nia Osei", sortOrder: 2 },
    ]
  );

  it("builds a PDF party snapshot totalling five", () => {
    expect(party.totalPartyCount).toBe(MAX_TOTAL_PARTY);
    expect(party.adultGuestCount).toBe(2);
    expect(party.adultGuestNames).toEqual(["Kwame Osei", "Nia Osei"]);
    expect(party.children04Count).toBe(1);
    expect(party.children510Count).toBe(1);
  });

  it("shows the correct party size in the personalized email", () => {
    const input: TicketEmailInput = {
      purpose: "initial",
      party: {
        graduateName: party.graduateName,
        adultGuestNames: [...party.adultGuestNames],
        adultGuestCount: party.adultGuestCount,
        children04Count: party.children04Count,
        children510Count: party.children510Count,
        totalPartyCount: party.totalPartyCount,
      },
      event: {
        title: "Convocation Ceremony 2026",
        dateLabel: "Saturday, June 20, 2026",
        startLabel: "2:00 PM",
        endLabel: "5:00 PM",
        timezone: "America/Toronto",
        venueName: "Academy Hall",
        venueAddress: "1 Example Way, Toronto",
      },
      ticketCode: "TAE-4KJ7-92BX",
      pdfFileName: "TAE-Convocation-2026-TAE-4KJ7-92BX-V1.pdf",
      logoUrl: "https://tickets.example.org/taelogo.png",
    };

    const rendered = renderTicketEmail(input);
    expect(rendered.html).toContain("5 people in total");
    expect(rendered.text).toContain("5 people in total");

    const lines = describeEmailParty(input.party);
    expect(lines).toContain("Kwame Osei (adult guest)");
    expect(lines).toContain("Nia Osei (adult guest)");
    expect(lines.join("\n")).toContain("1 child aged 0 to 4");
    expect(lines.join("\n")).toContain("1 child aged 5 to 10");
  });
});

// ---------------------------------------------------------------------
// 12: manual add
// ---------------------------------------------------------------------

describe("manually added graduates", () => {
  it("accepts the valid maximum of two adult guests and two children", () => {
    for (const children of [
      { children04: 2, children510: 0 },
      { children04: 1, children510: 1 },
      { children04: 0, children510: 2 },
    ]) {
      const parsed = manualRegistrationSchema.safeParse(
        manualAdd({
          adultGuestCount: MAX_ADULT_GUESTS,
          adultGuestNames: ["Kwame Osei", "Nia Osei"],
          ...children,
        })
      );
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        const total =
          1 +
          parsed.data.adultGuestCount +
          parsed.data.children04 +
          parsed.data.children510;
        expect(total).toBe(MAX_TOTAL_PARTY);
      }
    }
  });

  it("rejects a third adult guest and a third child", () => {
    expect(
      manualRegistrationSchema.safeParse(
        manualAdd({ adultGuestCount: 3, children04: 0, children510: 0 })
      ).success
    ).toBe(false);
    expect(
      manualRegistrationSchema.safeParse(
        manualAdd({ adultGuestCount: 0, children04: 2, children510: 1 })
      ).success
    ).toBe(false);
  });
});
