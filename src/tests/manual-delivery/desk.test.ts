/**
 * Manual Delivery Desk state, filtering, search and the send audit.
 *
 * The rule these tests exist to protect: the application never claims a
 * ticket was emailed until an administrator records that they sent it.
 */

import { describe, expect, it } from "vitest";

import { MANUAL_DELIVERY_FILTERS } from "@/features/manual-delivery/constants";
import {
  markManuallySentSchema,
  recordResendSchema,
  replaceTicketSchema,
} from "@/features/manual-delivery/schemas";
import {
  filterDeliveryRows,
  findNextUnsent,
  resolveDeliveryState,
  searchDeliveryRows,
  summarizeDeliveryRows,
} from "@/features/manual-delivery/summaries";
import type { ManualDeliveryRow } from "@/features/manual-delivery/types";

function row(overrides: Partial<ManualDeliveryRow>): ManualDeliveryRow {
  return {
    registrationId: "11111111-1111-4111-8111-111111111111",
    graduateName: "Amara Osei",
    email: "amara.osei@example.com",
    phone: "4165550123",
    approvedPartySize: 3,
    approvedAdultGuests: 1,
    approvedChildren04: 1,
    approvedChildren510: 0,
    adultGuestNames: ["Kwame Osei"],
    ticketId: "22222222-2222-4222-8222-222222222222",
    ticketCode: "TAE-4KJ7-92BX",
    documentId: "33333333-3333-4333-8333-333333333333",
    pdfFileName: "TAE-Convocation-2026-TAE-4KJ7-92BX-V1.pdf",
    documentVersion: 1,
    pdfStatus: "current",
    partyUpdatedSinceLastSend: false,
    resendRecommended: false,
    state: "ready_to_send",
    sendCount: 0,
    lastSentAt: null,
    lastSendKind: null,
    checkedIn: false,
    registrationUpdatedAt: "2026-07-24T00:00:00.000Z",
    sourceOrderIds: ["1001", "1002"],
    ...overrides,
  };
}

const READY = {
  hasTicket: true,
  hasPdf: true,
  pdfOutdated: false,
  hasEmail: true,
  needsReconciliation: false,
  sendCount: 0,
};

describe("delivery state", () => {
  it("is ready to send when a ticket, a PDF and an address all exist", () => {
    expect(resolveDeliveryState(READY)).toBe("ready_to_send");
  });

  it("stays unsent until a send is recorded", () => {
    // Having everything in place is never the same as having sent it.
    expect(resolveDeliveryState(READY)).not.toBe("manually_sent");
    expect(resolveDeliveryState({ ...READY, sendCount: 1 })).toBe(
      "manually_sent"
    );
  });

  it("becomes resent from the second recorded send onwards", () => {
    expect(resolveDeliveryState({ ...READY, sendCount: 2 })).toBe("resent");
    expect(resolveDeliveryState({ ...READY, sendCount: 5 })).toBe("resent");
  });

  it("keeps a recorded send visible even when the PDF is regenerated", () => {
    expect(
      resolveDeliveryState({ ...READY, hasPdf: false, sendCount: 1 })
    ).toBe("manually_sent");
  });

  it("reports the first thing blocking a send", () => {
    expect(
      resolveDeliveryState({ ...READY, needsReconciliation: true })
    ).toBe("needs_reconciliation");
    expect(resolveDeliveryState({ ...READY, hasTicket: false })).toBe(
      "ticket_missing"
    );
    expect(resolveDeliveryState({ ...READY, hasEmail: false })).toBe(
      "email_missing"
    );
    expect(resolveDeliveryState({ ...READY, hasPdf: false })).toBe(
      "pdf_missing"
    );
  });

  it("never treats an outdated PDF as ready to send", () => {
    // The registration changed after the current PDF was generated.
    expect(resolveDeliveryState({ ...READY, pdfOutdated: true })).toBe(
      "pdf_outdated"
    );
    expect(resolveDeliveryState({ ...READY, pdfOutdated: true })).not.toBe(
      "ready_to_send"
    );
  });
});

describe("desk filters", () => {
  const rows = [
    row({ registrationId: "a", state: "ready_to_send" }),
    row({ registrationId: "b", state: "manually_sent", sendCount: 1 }),
    row({ registrationId: "c", state: "resent", sendCount: 3 }),
    row({ registrationId: "d", state: "ticket_missing", ticketId: null }),
    row({ registrationId: "e", state: "email_missing", email: null }),
    row({ registrationId: "f", state: "needs_reconciliation" }),
    row({ registrationId: "g", state: "ready_to_send", checkedIn: true }),
  ];

  it("offers exactly the filters the workflow needs", () => {
    expect([...MANUAL_DELIVERY_FILTERS]).toEqual([
      "all",
      "ready_to_send",
      "ticket_missing",
      "manually_sent",
      "resent",
      "email_missing",
      "needs_reconciliation",
      "checked_in",
      "not_checked_in",
    ]);
  });

  it("separates a first send from a resend", () => {
    expect(
      filterDeliveryRows(rows, "manually_sent").map((r) => r.registrationId)
    ).toEqual(["b"]);
    expect(
      filterDeliveryRows(rows, "resent").map((r) => r.registrationId)
    ).toEqual(["c"]);
  });

  it("filters by every other listed state", () => {
    expect(filterDeliveryRows(rows, "ready_to_send")).toHaveLength(2);
    expect(filterDeliveryRows(rows, "ticket_missing")).toHaveLength(1);
    expect(filterDeliveryRows(rows, "email_missing")).toHaveLength(1);
    expect(filterDeliveryRows(rows, "needs_reconciliation")).toHaveLength(1);
    expect(filterDeliveryRows(rows, "checked_in")).toHaveLength(1);
    expect(filterDeliveryRows(rows, "not_checked_in")).toHaveLength(6);
    expect(filterDeliveryRows(rows, "all")).toHaveLength(7);
  });

  it("summarizes the desk", () => {
    const summary = summarizeDeliveryRows(rows);
    expect(summary.totalGraduates).toBe(7);
    expect(summary.readyToSend).toBe(2);
    expect(summary.manuallySent).toBe(1);
    expect(summary.resent).toBe(1);
    expect(summary.emailMissing).toBe(1);
    expect(summary.checkedIn).toBe(1);
  });
});

describe("desk search", () => {
  const rows = [
    row({
      registrationId: "a",
      graduateName: "Amara Osei",
      email: "amara.osei@example.com",
      phone: "(416) 555-0123",
      ticketCode: "TAE-4KJ7-92BX",
      sourceOrderIds: ["1001", "1002"],
    }),
    row({
      registrationId: "b",
      graduateName: "Nikhil Varma",
      email: "nikhil.varma@example.com",
      phone: "4165550999",
      ticketCode: "TAE-8QW2-31LM",
      sourceOrderIds: ["2001"],
    }),
  ];

  const ids = (search: string) =>
    searchDeliveryRows(rows, search).map((r) => r.registrationId);

  it("matches on graduate name", () => {
    expect(ids("amara")).toEqual(["a"]);
  });

  it("matches on email address", () => {
    expect(ids("nikhil.varma@example.com")).toEqual(["b"]);
  });

  it("matches on phone digits regardless of formatting", () => {
    expect(ids("4165550123")).toEqual(["a"]);
    expect(ids("555-0999")).toEqual(["b"]);
  });

  it("matches on a source order ID, including a supplemental order", () => {
    expect(ids("1002")).toEqual(["a"]);
  });

  it("matches on ticket code and on PDF file name", () => {
    expect(ids("8QW2")).toEqual(["b"]);
    expect(ids("TAE-Convocation-2026")).toHaveLength(2);
  });

  it("returns everything for a blank search", () => {
    expect(ids("")).toHaveLength(2);
  });
});

describe("mark sent and open next unsent", () => {
  const rows = [
    row({ registrationId: "a", state: "manually_sent", sendCount: 1 }),
    row({ registrationId: "b", state: "ready_to_send" }),
    row({ registrationId: "c", state: "ticket_missing" }),
    row({ registrationId: "d", state: "ready_to_send" }),
  ];

  it("advances to the next graduate that is ready to send", () => {
    expect(findNextUnsent(rows, "b")).toBe("d");
  });

  it("skips graduates that are not ready", () => {
    expect(findNextUnsent(rows, "a")).toBe("b");
  });

  it("wraps around to the top of the list", () => {
    expect(findNextUnsent(rows, "d")).toBe("b");
  });

  it("returns null when nothing is left to send", () => {
    expect(
      findNextUnsent(
        [row({ registrationId: "a", state: "manually_sent", sendCount: 1 })],
        "a"
      )
    ).toBeNull();
  });
});

describe("recording a send", () => {
  const base = {
    registrationId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "b7d1f0a4-6c2e-4c1a-9f60-6f5f0a2c9a11",
  };

  it("requires an idempotency key so a double-click records one attempt", () => {
    expect(markManuallySentSchema.safeParse(base).success).toBe(true);
    expect(
      markManuallySentSchema.safeParse({ ...base, idempotencyKey: "" }).success
    ).toBe(false);
  });

  it("requires a reason for a resend", () => {
    expect(recordResendSchema.safeParse(base).success).toBe(false);
    expect(
      recordResendSchema.safeParse({ ...base, reason: "no" }).success
    ).toBe(false);
    expect(
      recordResendSchema.safeParse({
        ...base,
        reason: "Graduate reported the first email went to spam",
      }).success
    ).toBe(true);
  });

  it("requires a reason for a replacement", () => {
    expect(replaceTicketSchema.safeParse(base).success).toBe(false);
    expect(
      replaceTicketSchema.safeParse({
        ...base,
        reason: "Ticket forwarded to the wrong recipient",
      }).success
    ).toBe(true);
  });
});
