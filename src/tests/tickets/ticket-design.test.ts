import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import {
  TicketCard,
  type TicketCardProps,
} from "@/features/tickets/components/ticket-card";

const TICKET_ID = "11111111-2222-4333-8444-555555555555";

function props(overrides: Partial<TicketCardProps> = {}): TicketCardProps {
  return {
    graduateName: "Test Graduate 001",
    eventName: "Test Graduation 2026",
    startsAt: "2026-08-01T17:00:00Z",
    timezone: "America/Toronto",
    venueName: "Test Hall",
    venueAddress: "1 Fictional Street, Toronto",
    registeredAdultGuests: 2,
    registeredChildren04: 1,
    registeredChildren510: 0,
    partySize: 4,
    ticketCode: "GR26-ABCD-EFGH",
    status: "active",
    qrSrc: `/api/admin/tickets/${TICKET_ID}/qr`,
    ...overrides,
  };
}

function render(overrides: Partial<TicketCardProps> = {}): string {
  return renderToStaticMarkup(createElement(TicketCard, props(overrides)));
}

describe("digital ticket design", () => {
  it("displays the graduate name and required headings", () => {
    const html = render();
    expect(html).toContain("Test Graduate 001");
    expect(html).toContain("Toronto Academy of Education");
    expect(html).toContain("Graduation Ceremony");
    expect(html).toContain("Graduate Admission Ticket");
  });

  it("uses database-driven event date and venue", () => {
    const html = render();
    expect(html).toContain("Test Hall");
    expect(html).toContain("1 Fictional Street, Toronto");
    expect(html).toContain("2026");
    const fallback = render({ startsAt: null, venueName: null });
    expect(fallback).toContain("Date to be announced");
    expect(fallback).toContain("Venue to be announced");
  });

  it("displays all party counts and the ticket code", () => {
    const html = render();
    expect(html).toContain("Adult guests");
    expect(html).toContain("Children 0 to 4");
    expect(html).toContain("Children 5 to 10");
    expect(html).toContain("Total party");
    expect(html).toContain("GR26-ABCD-EFGH");
  });

  it("includes the entrance and uniqueness messages", () => {
    const html = render();
    expect(html).toContain("Present this ticket at the entrance");
    expect(html).toContain(
      "This ticket is unique to this registration. Do not share or duplicate it."
    );
    // CHECKIN-07 may allow partial party arrivals, so no one-time-use claim.
    expect(html).not.toContain("only once");
  });

  it("shows the active status as text", () => {
    expect(render()).toContain("Status: Active");
  });

  it("renders a large watermark for revoked tickets", () => {
    const html = render({
      status: "revoked",
      qrSrc: `/api/admin/tickets/${TICKET_ID}/qr?view=historical`,
    });
    expect(html).toContain("Revoked");
    expect(html).toContain("uppercase");
    expect(html).toContain("opacity-60");
  });

  it("renders a large watermark for replaced tickets", () => {
    const html = render({ status: "replaced", qrSrc: null });
    expect(html).toContain("Replaced");
  });

  it("marks pending tickets as not ready with no QR", () => {
    const html = render({ status: "pending", qrSrc: null });
    expect(html).toContain("Status: Pending");
    expect(html).toContain("QR not available");
    expect(html).not.toContain("<img");
  });

  it("references the QR image by ticket UUID only", () => {
    const html = render();
    expect(html).toContain(`/api/admin/tickets/${TICKET_ID}/qr`);
    expect(html).not.toContain("token");
    expect(html).not.toContain("v1.");
  });

  it("provides QR alt text without any token material", () => {
    const html = render();
    expect(html).toContain("QR code for entrance scanning");
    expect(html).not.toMatch(/alt="[^"]*v1\./);
  });

  it("never displays contact, payment or internal data", () => {
    const html = render();
    expect(html).not.toContain("@example.com");
    expect(html).not.toContain("416555");
    expect(html).not.toContain("MOCK-");
    expect(html.toLowerCase()).not.toContain("email");
    expect(html.toLowerCase()).not.toContain("phone");
    expect(html.toLowerCase()).not.toContain("payment");
    expect(html.toLowerCase()).not.toContain("order_id");
    expect(html.toLowerCase()).not.toContain("source order");
    expect(html.toLowerCase()).not.toMatch(/\border total\b/);
    expect(html).not.toMatch(/[0-9a-f]{64}/);
  });
});
