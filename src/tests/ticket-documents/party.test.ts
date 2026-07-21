/**
 * Registered-party normalization. All fixtures are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  buildRegisteredParty,
  describeParty,
  hasUnnamedAdultGuests,
} from "@/features/ticket-documents/party";

import { adultGuest, childGuest, makeParty } from "./fixtures";

describe("registered party normalization", () => {
  it("counts a graduate with no guests as a party of one", () => {
    const party = makeParty();
    expect(party.graduateCount).toBe(1);
    expect(party.totalPartyCount).toBe(1);
    expect(party.adultGuestNames).toEqual([]);
  });

  it("computes the total across every category", () => {
    const party = makeParty({
      registeredAdultGuests: 2,
      registeredChildren04: 2,
      registeredChildren510: 1,
    });
    expect(party.totalPartyCount).toBe(6);
  });

  it("orders adult guest names by sort order", () => {
    const party = makeParty({ registeredAdultGuests: 2 }, [
      adultGuest("Second Guestington", 2),
      adultGuest("First Guestington", 1),
    ]);
    expect(party.adultGuestNames).toEqual([
      "First Guestington",
      "Second Guestington",
    ]);
  });

  it("drops blank guest names rather than rendering an empty line", () => {
    const party = makeParty({ registeredAdultGuests: 2 }, [
      adultGuest("Named Guestington", 1),
      adultGuest("   ", 2),
    ]);
    expect(party.adultGuestNames).toEqual(["Named Guestington"]);
    expect(hasUnnamedAdultGuests(party)).toBe(true);
  });

  it("keeps a null guest name as a count only", () => {
    const party = makeParty({ registeredAdultGuests: 1 }, [
      adultGuest(null, 1),
    ]);
    expect(party.adultGuestNames).toEqual([]);
    expect(party.adultGuestCount).toBe(1);
    expect(party.totalPartyCount).toBe(2);
  });

  it("never shows more names than the registered adult count", () => {
    // A stale extra guest row must not inflate the printed ticket.
    const party = makeParty({ registeredAdultGuests: 1 }, [
      adultGuest("First Guestington", 1),
      adultGuest("Stale Guestington", 2),
    ]);
    expect(party.adultGuestNames).toEqual(["First Guestington"]);
    expect(party.totalPartyCount).toBe(2);
  });

  it("ignores child rows when building adult names", () => {
    const party = makeParty(
      { registeredAdultGuests: 1, registeredChildren04: 1 },
      [adultGuest("First Guestington", 1), childGuest("child_0_4", 2)]
    );
    expect(party.adultGuestNames).toEqual(["First Guestington"]);
    expect(party.children04Count).toBe(1);
  });

  it("normalizes whitespace inside names", () => {
    const party = makeParty(
      { graduateFullName: "  Avery   Testerton  ", registeredAdultGuests: 1 },
      [adultGuest("  Jordan   Sampleford ", 1)]
    );
    expect(party.graduateName).toBe("Avery Testerton");
    expect(party.adultGuestNames).toEqual(["Jordan Sampleford"]);
  });

  it("treats negative or invalid counts as zero", () => {
    const party = buildRegisteredParty(
      {
        graduateFullName: "Avery Testerton",
        registeredAdultGuests: -3,
        registeredChildren04: Number.NaN,
        registeredChildren510: 0,
      },
      []
    );
    expect(party.adultGuestCount).toBe(0);
    expect(party.children04Count).toBe(0);
    expect(party.totalPartyCount).toBe(1);
  });

  it("describes the party for list views", () => {
    const party = makeParty({
      registeredAdultGuests: 1,
      registeredChildren04: 1,
      registeredChildren510: 2,
    });
    expect(describeParty(party)).toBe(
      "1 graduate, 1 adult guest, 1 child 0-4, 2 child 5-10"
    );
  });
});
