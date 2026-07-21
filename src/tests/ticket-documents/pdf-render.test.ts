/**
 * Rendering tests for the branded PDF admission ticket.
 *
 * These assert the printed contract: a valid single-page PDF carrying the
 * required headings, event facts, schedule, party breakdown and identifiers,
 * with no credential material anywhere in the bytes.
 *
 * All fixtures are synthetic. No real student data appears here.
 */

import { describe, expect, it } from "vitest";

import { buildQrPayload } from "@/features/tickets/qr-payload";
import { buildTicketToken } from "@/features/tickets/token";
import {
  countPdfPages,
  hasPdfSignature,
  renderTicketPdf,
} from "@/features/ticket-documents/render";
import type { RenderTicketPdfInput } from "@/features/ticket-documents/render";

import {
  extractPdfMatchText,
  extractPdfRaw,
  normalizeForMatch,
} from "./pdf-text";
import {
  TEST_EVENT,
  TEST_SECRET,
  TEST_SETTINGS,
  TEST_TICKET_CODE,
  TEST_TICKET_ID,
  adultGuest,
  makeParty,
} from "./fixtures";

function baseInput(
  overrides: Partial<RenderTicketPdfInput> = {}
): RenderTicketPdfInput {
  return {
    ticketId: TEST_TICKET_ID,
    ticketCode: TEST_TICKET_CODE,
    ticketSecret: TEST_SECRET,
    settings: TEST_SETTINGS,
    event: TEST_EVENT,
    party: makeParty(),
    documentVersion: 1,
    issuedAtLabel: "July 20, 2026",
    watermark: null,
    ...overrides,
  };
}

/**
 * Renders and returns the printed text normalized for phrase matching.
 * Always assert through expectPrinted so the needle is normalized the same
 * way as the haystack.
 */
async function renderText(input: RenderTicketPdfInput): Promise<string> {
  const bytes = await renderTicketPdf(input);
  return extractPdfMatchText(bytes);
}

/**
 * Whitespace- and case-insensitive assertions against printed PDF text.
 *
 * The PDF writer splits phrases at line wraps and at interpolated values,
 * so a literal comparison would fail on text that is visually correct.
 * Letter casing is ignored because several labels are uppercased by
 * textTransform in the theme; these tests assert that the information is
 * present, and its casing is a styling concern owned by theme.ts.
 */
function expectPrinted(text: string) {
  const haystack = text.toLowerCase();
  return {
    toContain(needle: string): void {
      expect(haystack).toContain(normalizeForMatch(needle).toLowerCase());
    },
    not: {
      toContain(needle: string): void {
        expect(haystack).not.toContain(normalizeForMatch(needle).toLowerCase());
      },
    },
  };
}

describe("branded PDF admission ticket", () => {
  it("produces bytes with a valid PDF signature", async () => {
    const bytes = await renderTicketPdf(baseInput());
    expect(hasPdfSignature(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("is exactly one page", async () => {
    const bytes = await renderTicketPdf(baseInput());
    expect(countPdfPages(bytes)).toBe(1);
  });

  it("stays one page for the largest permitted registered party", async () => {
    const party = makeParty(
      {
        graduateFullName:
          "Alexandria Wilhelmina Featherstonehaugh-Montgomery",
        registeredAdultGuests: 2,
        registeredChildren04: 1,
        registeredChildren510: 1,
      },
      [
        adultGuest("Bartholomew Fitzwilliam Rosencrantz-Lindqvist", 1),
        adultGuest("Persephone Anastasia Vandermeer-Okonkwo", 2),
      ]
    );
    const bytes = await renderTicketPdf(baseInput({ party }));
    expect(countPdfPages(bytes)).toBe(1);
  });

  it("prints the required heading lines", async () => {
    const text = await renderText(baseInput());
    expectPrinted(text).toContain("Toronto Academy of Education");
    expectPrinted(text).toContain("Convocation Ceremony 2026");
    expectPrinted(text).toContain("Graduate & Registered Party Admission Ticket");
  });

  it("prints the full ceremony details", async () => {
    const text = await renderText(baseInput());
    expectPrinted(text).toContain("Sunday, July 26, 2026");
    expectPrinted(text).toContain("12:00 PM");
    expectPrinted(text).toContain("4:00 PM");
    expectPrinted(text).toContain("Mississauga Grand Banquet & Event Centre");
    expectPrinted(text).toContain("35 Brunel Road, Mississauga, ON L4Z 3E8");
  });

  it("prints all three program schedule entries and invents no fourth", async () => {
    const text = await renderText(baseInput());
    expectPrinted(text).toContain("Introduction & Refreshments");
    expectPrinted(text).toContain("A Special Message to Our Graduates");
    expectPrinted(text).toContain("Certificate & Award Ceremony");
    expectPrinted(text).toContain("12:15 PM");
    expectPrinted(text).toContain("2:30 PM");
    // Nothing is scheduled after the certificate ceremony ends.
    expectPrinted(text).not.toContain("3:00 PM");
    expectPrinted(text).not.toContain("3:30 PM");
  });

  it("prints the ticket code and graduate name", async () => {
    const text = await renderText(baseInput());
    expectPrinted(text).toContain(TEST_TICKET_CODE);
    expectPrinted(text).toContain("Avery Testerton");
  });

  it("prints the document version, issue date and total party count", async () => {
    const text = await renderText(
      baseInput({ documentVersion: 3, party: makeParty({ registeredAdultGuests: 2 }) })
    );
    expectPrinted(text).toContain("V3");
    expectPrinted(text).toContain("July 20, 2026");
    expectPrinted(text).toContain("Total registered party");
    expectPrinted(text).toContain("Admits 3");
  });

  it("prints the single-ticket coverage statement", async () => {
    const text = await renderText(baseInput());
    expectPrinted(text).toContain(
      "This single admission ticket covers the graduate and all registered " +
        "guests shown below. No separate guest ticket is required."
    );
  });

  it("prints the live validation note", async () => {
    const text = await renderText(baseInput());
    expectPrinted(text).toContain(
      "Admission is subject to live ticket validation at check-in."
    );
  });

  it("never writes the raw token, QR payload or ticket UUID into the PDF", async () => {
    const token = buildTicketToken(TEST_TICKET_ID, TEST_SECRET);
    const payload = buildQrPayload(token);
    const bytes = await renderTicketPdf(baseInput());
    const raw = extractPdfRaw(bytes);
    expect(raw).not.toContain(token);
    expect(raw).not.toContain(payload);
    expect(raw).not.toContain(TEST_TICKET_ID);
    expect(raw).not.toContain(TEST_SECRET);
  });

  it("never prints an internal identifier, email or phone number", async () => {
    const text = await renderText(baseInput());
    expectPrinted(text).not.toContain(TEST_TICKET_ID);
    expectPrinted(text).not.toContain("@");
    expect(text).not.toMatch(/\b\d{3}-\d{3}-\d{4}\b/);
  });

  it("omits the watermark on a newly generated current document", async () => {
    const text = await renderText(baseInput({ watermark: null }));
    for (const label of ["SUPERSEDED", "REPLACED", "REVOKED", "INVALID"]) {
      expectPrinted(text).not.toContain(label);
    }
  });

  it.each(["SUPERSEDED", "REPLACED", "REVOKED", "INVALID"] as const)(
    "watermarks a historical preview with %s",
    async (label) => {
      const text = await renderText(baseInput({ watermark: label }));
      expectPrinted(text).toContain(label);
    }
  );
});

describe("registered party rendering", () => {
  it("handles a registration with no guests", async () => {
    const text = await renderText(baseInput({ party: makeParty() }));
    expectPrinted(text).toContain("Admits 1");
    expectPrinted(text).toContain("Adult guests");
  });

  it("handles one adult guest with a name", async () => {
    const party = makeParty({ registeredAdultGuests: 1 }, [
      adultGuest("Jordan Sampleford", 1),
    ]);
    const text = await renderText(baseInput({ party }));
    expectPrinted(text).toContain("Jordan Sampleford");
    expectPrinted(text).toContain("Admits 2");
  });

  it("handles two adult guests with names", async () => {
    const party = makeParty({ registeredAdultGuests: 2 }, [
      adultGuest("Jordan Sampleford", 1),
      adultGuest("Riley Placeholderson", 2),
    ]);
    const text = await renderText(baseInput({ party }));
    expectPrinted(text).toContain("Jordan Sampleford");
    expectPrinted(text).toContain("Riley Placeholderson");
    expectPrinted(text).toContain("Admits 3");
  });

  it("handles children age 0 to 4", async () => {
    const party = makeParty({ registeredChildren04: 2 });
    const text = await renderText(baseInput({ party }));
    expectPrinted(text).toContain("Children age 0 to 4");
    expectPrinted(text).toContain("Admits 3");
  });

  it("handles children age 5 to 10", async () => {
    const party = makeParty({ registeredChildren510: 2 });
    const text = await renderText(baseInput({ party }));
    expectPrinted(text).toContain("Children age 5 to 10");
    expectPrinted(text).toContain("Admits 3");
  });

  it("handles a mixed adult and child party", async () => {
    const party = makeParty(
      {
        registeredAdultGuests: 2,
        registeredChildren04: 1,
        registeredChildren510: 1,
      },
      [adultGuest("Jordan Sampleford", 1), adultGuest("Riley Placeholderson", 2)]
    );
    const text = await renderText(baseInput({ party }));
    expectPrinted(text).toContain("Admits 5");
    expect(party.totalPartyCount).toBe(5);
  });

  it("shows a count without inventing a name for an unnamed adult guest", async () => {
    const party = makeParty({ registeredAdultGuests: 2 }, [
      adultGuest("Jordan Sampleford", 1),
    ]);
    const text = await renderText(baseInput({ party }));
    expectPrinted(text).toContain("Jordan Sampleford");
    expectPrinted(text).toContain("1 additional adult guest");
    expectPrinted(text).toContain("Admits 3");
  });

  it("renders no empty guest name line when no names exist", async () => {
    const party = makeParty({ registeredAdultGuests: 2 }, []);
    const text = await renderText(baseInput({ party }));
    expect(party.adultGuestNames).toHaveLength(0);
    expectPrinted(text).toContain("2 additional adult guests");
  });

  it("keeps a very long graduate name on one page", async () => {
    const party = makeParty({
      graduateFullName:
        "Maximilian Bartholomew Christopher Alexander Fitzgerald " +
        "Wollstonecraft-Devereux III",
    });
    const bytes = await renderTicketPdf(baseInput({ party }));
    expect(countPdfPages(bytes)).toBe(1);
  });

  it("keeps very long guest names on one page", async () => {
    const party = makeParty({ registeredAdultGuests: 2 }, [
      adultGuest(
        "Anastasia Genevieve Featherstonehaugh-Wollstonecraft-Devereux",
        1
      ),
      adultGuest(
        "Bartholomew Maximilian Rosencrantz-Guildenstern-Lindqvist",
        2
      ),
    ]);
    const bytes = await renderTicketPdf(baseInput({ party }));
    expect(countPdfPages(bytes)).toBe(1);
  });
});
