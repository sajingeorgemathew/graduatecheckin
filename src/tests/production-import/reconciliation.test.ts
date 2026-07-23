/**
 * The critical business rules of CHECKIN-10B.
 *
 * A repeated graduate row is not automatically a duplicate. These tests
 * pin down the three things that look alike in the workbook - a duplicate
 * submission, a supplemental guest order, and two people sharing one email
 * address - and the payment-backed entitlement rules that decide what a
 * graduate's approved party actually is.
 *
 * Everything runs through the real header mapper and row normalizer, so a
 * change to the workbook contract fails here too.
 */

import { describe, expect, it } from "vitest";

import { countReconciliation } from "@/features/production-import/reconciliation";
import { freeRow, paidRow, reconcileRsvpRows } from "./fixtures";

function only<T>(values: readonly T[]): T {
  expect(values).toHaveLength(1);
  return values[0];
}

function reasonCodes(graduate: {
  reviewReasons: { code: string }[];
}): string[] {
  return graduate.reviewReasons.map((reason) => reason.code);
}

describe("duplicate graduate submissions", () => {
  it("suggests consolidating repeated zero-dollar rows with no guests", () => {
    const result = reconcileRsvpRows([
      freeRow({
        order_id: "1001",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
      }),
      freeRow({
        order_id: "1002",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
      }),
    ]);

    const graduate = only(result.graduates);
    expect(graduate.orders.map((entry) => entry.role)).toEqual([
      "primary",
      "duplicate_submission",
    ]);
  });

  it("keeps every source order ID for audit while creating one graduate", () => {
    const result = reconcileRsvpRows([
      freeRow({
        order_id: "1001",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
      }),
      freeRow({
        order_id: "1002",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
      }),
      freeRow({
        order_id: "1003",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
      }),
    ]);

    const graduate = only(result.graduates);
    expect(graduate.orders.map((entry) => entry.order.sourceOrderId)).toEqual([
      "1001",
      "1002",
      "1003",
    ]);
    // One reconciled graduate always means one registration and one ticket.
    expect(countReconciliation(result).expectedTicketCount).toBe(1);
  });
});

describe("supplemental guest orders", () => {
  const rows = [
    freeRow({
      order_id: "2001",
      "Full Name": "Nikhil Varma",
      Email: "nikhil.varma@example.com",
    }),
    paidRow({
      order_id: "2002",
      "Full Name": "Nikhil Varma",
      Email: "nikhil.varma@example.com",
      "Guest 1 - Full Name": "Sunita Varma",
      Note: "Adding one more guest",
    }),
  ];

  it("does not discard a paid guest order as a duplicate", () => {
    const graduate = only(reconcileRsvpRows(rows).graduates);
    expect(graduate.orders.map((entry) => entry.role)).toEqual([
      "primary",
      "supplemental",
    ]);
    expect(graduate.orders[1].role).not.toBe("duplicate_submission");
  });

  it("keeps the supplemental order linked by its source order ID", () => {
    const graduate = only(reconcileRsvpRows(rows).graduates);
    const supplemental = graduate.orders.find(
      (entry) => entry.role === "supplemental"
    );
    expect(supplemental?.order.sourceOrderId).toBe("2002");
  });

  it("creates no second graduate registration", () => {
    expect(reconcileRsvpRows(rows).graduates).toHaveLength(1);
  });

  it("creates no second initial ticket", () => {
    const result = reconcileRsvpRows(rows);
    expect(countReconciliation(result).expectedTicketCount).toBe(1);
  });

  it("merges the paid guest into the graduate's approved party", () => {
    const graduate = only(reconcileRsvpRows(rows).graduates);
    expect(graduate.approvedAdultGuests).toBe(1);
    expect(graduate.approvedAdultGuestNames).toEqual(["Sunita Varma"]);
    // Money across separate transactions genuinely adds up.
    expect(graduate.orderTotal).toBeCloseTo(45.2, 2);
  });

  it("treats a guest-update note alone as a supplemental order", () => {
    const graduate = only(
      reconcileRsvpRows([
        freeRow({
          order_id: "2101",
          "Full Name": "Lena Fischer",
          Email: "lena.fischer@example.com",
        }),
        freeRow({
          order_id: "2102",
          "Full Name": "Lena Fischer",
          Email: "lena.fischer@example.com",
          Note: "Please add another guest, payment to follow",
        }),
      ]).graduates
    );
    expect(graduate.orders[1].role).toBe("supplemental");
  });
});

describe("payment-backed entitlement", () => {
  it("holds an adult guest that has no supporting payment", () => {
    const graduate = only(
      reconcileRsvpRows([
        freeRow({
          order_id: "3001",
          "Full Name": "Tomas Reyes",
          Email: "tomas.reyes@example.com",
          "Guest 1 - Full Name": "Ines Reyes",
        }),
      ]).graduates
    );
    expect(reasonCodes(graduate)).toContain("unpaid_adult_guest");
    expect(graduate.approvedAdultGuests).toBe(0);
    expect(graduate.proposedAdultGuests).toBe(1);
    expect(graduate.decision).toBe("needs_review");
  });

  it("approves an adult guest backed by a payment", () => {
    const graduate = only(
      reconcileRsvpRows([
        paidRow({
          order_id: "3002",
          "Full Name": "Tomas Reyes",
          Email: "tomas.reyes@example.com",
          "Guest 1 - Full Name": "Ines Reyes",
        }),
      ]).graduates
    );
    expect(reasonCodes(graduate)).not.toContain("unpaid_adult_guest");
    expect(graduate.approvedAdultGuests).toBe(1);
    expect(graduate.decision).toBe("approved");
  });

  it("holds a child aged 5 to 10 that has no supporting payment", () => {
    const graduate = only(
      reconcileRsvpRows([
        freeRow({
          order_id: "3003",
          "Full Name": "Grace Okafor",
          Email: "grace.okafor@example.com",
          Kids: 1,
        }),
      ]).graduates
    );
    expect(reasonCodes(graduate)).toContain("unpaid_child_5_10");
    expect(graduate.approvedChildren510).toBe(0);
    expect(graduate.decision).toBe("needs_review");
  });

  it("approves a paid child aged 5 to 10", () => {
    const graduate = only(
      reconcileRsvpRows([
        paidRow({
          order_id: "3004",
          "Full Name": "Grace Okafor",
          Email: "grace.okafor@example.com",
          Kids: 1,
        }),
      ]).graduates
    );
    expect(graduate.approvedChildren510).toBe(1);
    expect(graduate.decision).toBe("approved");
  });

  it("lets an explicitly selected child aged 0 to 4 attend free", () => {
    const graduate = only(
      reconcileRsvpRows([
        freeRow({
          order_id: "3005",
          "Full Name": "Yusuf Rahman",
          Email: "yusuf.rahman@example.com",
          "Kids (0 to 4)": 1,
        }),
      ]).graduates
    );
    expect(graduate.approvedChildren04).toBe(1);
    expect(reasonCodes(graduate)).not.toContain("unconfirmed_child_0_4");
    expect(graduate.decision).toBe("approved");
  });

  it("records no child aged 0 to 4 when the cell was left blank", () => {
    const graduate = only(
      reconcileRsvpRows([
        freeRow({
          order_id: "3006",
          "Full Name": "Yusuf Rahman",
          Email: "yusuf.rahman@example.com",
          Note: "bringing a toddler",
        }),
      ]).graduates
    );
    // Nothing is invented from a note: the count stays zero and the free
    // child is only ever added by an explicit administrator decision.
    expect(graduate.approvedChildren04).toBe(0);
    expect(graduate.proposedChildren04).toBe(0);
  });
});

describe("guest counting rules", () => {
  it("counts a repeated identical guest name only once", () => {
    const graduate = only(
      reconcileRsvpRows([
        paidRow({
          order_id: "4001",
          "Full Name": "Mei Tanaka",
          Email: "mei.tanaka@example.com",
          "Guest 1 - Full Name": "Hiro Tanaka",
        }),
        paidRow({
          order_id: "4002",
          "Full Name": "Mei Tanaka",
          Email: "mei.tanaka@example.com",
          "Guest 1 - Full Name": "hiro  tanaka",
        }),
      ]).graduates
    );
    expect(graduate.proposedAdultGuests).toBe(1);
    expect(reasonCodes(graduate)).toContain("repeated_guest_name");
    expect(graduate.decision).toBe("needs_review");
  });

  it("flags a guest cell that appears to hold more than one person", () => {
    const graduate = only(
      reconcileRsvpRows([
        paidRow({
          order_id: "4003",
          "Full Name": "Ravi Menon",
          Email: "ravi.menon@example.com",
          "Guest 1 - Full Name": "Anita Menon and Deepak Menon",
        }),
      ]).graduates
    );
    expect(reasonCodes(graduate)).toContain("ambiguous_guest_cell");
    expect(graduate.decision).toBe("needs_review");
    // The cell is never split into two guests automatically.
    expect(graduate.proposedAdultGuests).toBe(1);
  });

  it("never blindly adds repeated child counts together", () => {
    const graduate = only(
      reconcileRsvpRows([
        paidRow({
          order_id: "4004",
          "Full Name": "Sofia Duarte",
          Email: "sofia.duarte@example.com",
          Kids: 1,
        }),
        paidRow({
          order_id: "4005",
          "Full Name": "Sofia Duarte",
          Email: "sofia.duarte@example.com",
          Kids: 1,
          Note: "guest payment",
        }),
      ]).graduates
    );
    // Two rows each saying "1 child" describe one child recorded twice.
    expect(graduate.proposedChildren510).toBe(1);
    expect(graduate.approvedChildren510).toBe(1);
  });

  it("flags genuinely conflicting child counts for review", () => {
    const graduate = only(
      reconcileRsvpRows([
        paidRow({
          order_id: "4006",
          "Full Name": "Sofia Duarte",
          Email: "sofia.duarte@example.com",
          Kids: 1,
        }),
        paidRow({
          order_id: "4007",
          "Full Name": "Sofia Duarte",
          Email: "sofia.duarte@example.com",
          Kids: 2,
        }),
      ]).graduates
    );
    expect(reasonCodes(graduate)).toContain("conflicting_child_counts");
    expect(graduate.decision).toBe("needs_review");
  });
});

describe("same email, different person", () => {
  it("requires an administrator decision and never silently merges", () => {
    const result = reconcileRsvpRows([
      paidRow({
        order_id: "5001",
        "Full Name": "Daniel Kimura",
        Email: "shared.household@example.com",
      }),
      paidRow({
        order_id: "5002",
        "Full Name": "Hana Kimura",
        Email: "shared.household@example.com",
      }),
    ]);

    expect(result.graduates).toHaveLength(2);
    for (const graduate of result.graduates) {
      expect(reasonCodes(graduate)).toContain("same_email_different_name");
      expect(graduate.decision).toBe("needs_review");
    }
  });

  it("treats a name-order variation as one graduate for review", () => {
    const result = reconcileRsvpRows([
      paidRow({
        order_id: "5003",
        "Full Name": "Priya Raman",
        Email: "priya.raman@example.com",
      }),
      paidRow({
        order_id: "5004",
        "Full Name": "Raman Priya",
        Email: "priya.raman@example.com",
      }),
    ]);
    // Grouped together rather than split into two graduates, but still
    // never merged silently: the ordering variation is one graduate.
    expect(result.graduates).toHaveLength(1);
    expect(result.graduates[0].orders).toHaveLength(2);
  });
});

describe("reconciliation counts", () => {
  it("reports one expected ticket per reconciled graduate", () => {
    const result = reconcileRsvpRows([
      freeRow({
        order_id: "6001",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
      }),
      freeRow({
        order_id: "6002",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
      }),
      paidRow({
        order_id: "6003",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
        "Guest 1 - Full Name": "Kwame Osei",
      }),
      paidRow({
        order_id: "6004",
        "Full Name": "Nikhil Varma",
        Email: "nikhil.varma@example.com",
      }),
    ]);

    const counts = countReconciliation(result);
    expect(counts.graduateCount).toBe(2);
    expect(counts.sourceOrderCount).toBe(4);
    expect(counts.duplicateSubmissionCount).toBe(1);
    expect(counts.supplementalOrderCount).toBe(1);
    expect(counts.expectedTicketCount).toBe(2);
  });
});
