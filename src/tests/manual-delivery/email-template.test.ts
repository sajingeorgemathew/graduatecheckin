/**
 * The personalized branded ticket email.
 *
 * Every graduate must receive their own message, carrying their ticket
 * code, their approved party and the exact PDF file name to attach. The
 * logo must be an absolute production URL so Gmail can render it after a
 * copy and paste, and the copy the administrator takes must be rendered
 * content rather than HTML source.
 *
 * All data below is synthetic and uses the reserved example.com domain.
 */

import { describe, expect, it } from "vitest";

import {
  buildGmailComposeUrl,
  buildProductionAssetUrl,
  buildSubject,
  describeEmailParty,
  renderTicketEmail,
  type TicketEmailInput,
} from "@/features/manual-delivery/email-template";

const PRODUCTION_URL = "https://tickets.example.org";

const baseInput: TicketEmailInput = {
  purpose: "initial",
  party: {
    graduateName: "Amara Osei",
    adultGuestNames: ["Kwame Osei"],
    adultGuestCount: 1,
    children04Count: 1,
    children510Count: 0,
    totalPartyCount: 3,
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
  logoUrl: `${PRODUCTION_URL}/taelogo.png`,
};

describe("production asset URL", () => {
  it("builds an absolute URL from a production origin", () => {
    expect(
      buildProductionAssetUrl("https://tickets.example.org", "taelogo.png")
    ).toBe("https://tickets.example.org/taelogo.png");
  });

  it("tolerates a trailing slash on the configured base URL", () => {
    expect(
      buildProductionAssetUrl("https://tickets.example.org/", "taelogo.png")
    ).toBe("https://tickets.example.org/taelogo.png");
  });

  it("never produces a localhost image URL", () => {
    for (const base of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://0.0.0.0:8080",
      "",
      "not-a-url",
    ]) {
      expect(buildProductionAssetUrl(base, "taelogo.png"), base).toBeNull();
    }
  });

  it("refuses a traversal attempt in the asset name", () => {
    expect(
      buildProductionAssetUrl(PRODUCTION_URL, "../secrets/key.pem")
    ).toBeNull();
  });
});

describe("personalization", () => {
  it("names the graduate in the subject and the body", () => {
    const email = renderTicketEmail(baseInput);
    expect(email.subject).toContain("Amara Osei");
    expect(email.html).toContain("Amara Osei");
    expect(email.text).toContain("Dear Amara Osei,");
  });

  it("generates a different email for each graduate", () => {
    const first = renderTicketEmail(baseInput);
    const second = renderTicketEmail({
      ...baseInput,
      party: {
        graduateName: "Nikhil Varma",
        adultGuestNames: [],
        adultGuestCount: 0,
        children04Count: 0,
        children510Count: 0,
        totalPartyCount: 1,
      },
      ticketCode: "TAE-8QW2-31LM",
      pdfFileName: "TAE-Convocation-2026-TAE-8QW2-31LM-V1.pdf",
    });

    expect(second.subject).not.toBe(first.subject);
    expect(second.html).not.toBe(first.html);
    expect(second.html).toContain("TAE-8QW2-31LM");
    expect(second.html).not.toContain("TAE-4KJ7-92BX");
  });

  it("carries the ticket code, party size, date, time and venue", () => {
    const email = renderTicketEmail(baseInput);
    expect(email.html).toContain("TAE-4KJ7-92BX");
    expect(email.html).toContain("3 people in total");
    expect(email.html).toContain("Saturday, June 20, 2026");
    expect(email.html).toContain("2:00 PM");
    expect(email.html).toContain("Academy Hall");
    expect(email.html).toContain("1 Example Way, Toronto");
  });

  it("includes arrival and check-in guidance", () => {
    const email = renderTicketEmail(baseInput);
    expect(email.html).toContain("45 minutes before");
    expect(email.text).toContain("45 minutes before");
  });

  it("lists the approved party, naming the guests it knows", () => {
    const lines = describeEmailParty(baseInput.party);
    expect(lines).toContain("Amara Osei (graduate)");
    expect(lines).toContain("Kwame Osei (adult guest)");
    expect(lines).toContain("1 child aged 0 to 4");
  });

  it("reports an unnamed guest as a count rather than inventing a name", () => {
    const lines = describeEmailParty({
      graduateName: "Mei Tanaka",
      adultGuestNames: [],
      adultGuestCount: 2,
      children04Count: 0,
      children510Count: 0,
      totalPartyCount: 3,
    });
    expect(lines).toContain("2 additional adult guests");
  });

  it("uses a distinct subject for a resend and a replacement", () => {
    expect(buildSubject("initial", "Amara Osei")).toContain("Your Toronto");
    expect(buildSubject("resend", "Amara Osei")).toContain("Resending");
    expect(buildSubject("replacement", "Amara Osei")).toContain("Replacement");
  });
});

describe("branding", () => {
  it("embeds the production logo URL as an absolute image source", () => {
    const email = renderTicketEmail(baseInput);
    expect(email.html).toContain(
      `src="${PRODUCTION_URL}/taelogo.png"`
    );
    expect(email.html).not.toContain("localhost");
    expect(email.blockingWarnings).toHaveLength(0);
  });

  it("falls back to a wordmark and warns when no production URL exists", () => {
    const email = renderTicketEmail({ ...baseInput, logoUrl: null });
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("TORONTO ACADEMY OF EDUCATION");
    expect(email.blockingWarnings.join(" ")).toContain(
      "production logo URL"
    );
  });
});

describe("rich and plain copies", () => {
  it("produces rendered HTML rather than escaped markup", () => {
    const email = renderTicketEmail(baseInput);
    // Real tags, not a string of visible angle brackets.
    expect(email.html).toContain("<table");
    expect(email.html).not.toContain("&lt;table");
    expect(email.html).not.toContain("&amp;lt;");
  });

  it("produces a plain-text alternative with no markup at all", () => {
    const email = renderTicketEmail(baseInput);
    expect(email.text).not.toContain("<");
    expect(email.text).not.toContain("style=");
    expect(email.text).toContain("Ticket code: TAE-4KJ7-92BX");
  });

  it("escapes an interpolated value so it can never inject markup", () => {
    const email = renderTicketEmail({
      ...baseInput,
      party: {
        ...baseInput.party,
        graduateName: 'Amara "<script>alert(1)</script>" Osei',
      },
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

describe("attachment instruction", () => {
  it("names the exact PDF file to attach", () => {
    const email = renderTicketEmail(baseInput);
    expect(email.attachmentInstruction).toBe(
      "Attach this file: TAE-Convocation-2026-TAE-4KJ7-92BX-V1.pdf"
    );
  });

  it("blocks the send when no PDF has been generated", () => {
    const email = renderTicketEmail({ ...baseInput, pdfFileName: null });
    expect(email.attachmentInstruction).toContain("no PDF generated yet");
    expect(email.blockingWarnings.join(" ")).toContain(
      "No current PDF exists"
    );
  });
});

describe("Gmail compose link", () => {
  it("carries the recipient and the subject", () => {
    const url = buildGmailComposeUrl(
      "amara.osei@example.com",
      "Your ticket - Amara Osei"
    );
    expect(url.startsWith("https://mail.google.com/mail/?")).toBe(true);
    expect(url).toContain("to=amara.osei%40example.com");
    expect(url).toContain("su=Your+ticket+-+Amara+Osei");
  });

  it("omits the recipient when no address is recorded", () => {
    const url = buildGmailComposeUrl(null, "Your ticket");
    expect(url).not.toContain("to=");
  });
});
