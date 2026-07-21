import { describe, expect, it } from "vitest";

import {
  auditGuestFlexibility,
  buildDeliveryParty,
  readPartySnapshot,
  writePartySnapshot,
} from "@/features/distribution/party-audit";
import type { GuestRecordInput } from "@/features/ticket-documents/party";

function guests(names: string[], category: GuestRecordInput["guestCategory"] = "adult"): GuestRecordInput[] {
  return names.map((guestName, index) => ({
    guestCategory: category,
    guestName,
    sortOrder: index + 1,
  }));
}

describe("guest-flexibility party building (no adult cap)", () => {
  it("handles a graduate only", () => {
    const party = buildDeliveryParty(
      {
        graduateFullName: "Grad",
        registeredAdultGuests: 0,
        registeredChildren04: 0,
        registeredChildren510: 0,
      },
      []
    );
    expect(party.totalPartyCount).toBe(1);
    expect(party.adultGuestNames).toEqual([]);
  });

  it.each([1, 2, 3, 4])("handles %i adult guests without truncation", (count) => {
    const names = Array.from({ length: count }, (_, i) => `Adult Guest ${i + 1}`);
    const party = buildDeliveryParty(
      {
        graduateFullName: "Grad",
        registeredAdultGuests: count,
        registeredChildren04: 0,
        registeredChildren510: 0,
      },
      guests(names)
    );
    expect(party.adultGuestCount).toBe(count);
    expect(party.adultGuestNames).toHaveLength(count);
    expect(party.totalPartyCount).toBe(1 + count);
  });

  it("handles children-only parties", () => {
    const party = buildDeliveryParty(
      {
        graduateFullName: "Grad",
        registeredAdultGuests: 0,
        registeredChildren04: 2,
        registeredChildren510: 1,
      },
      []
    );
    expect(party.children04Count).toBe(2);
    expect(party.children510Count).toBe(1);
    expect(party.totalPartyCount).toBe(4);
  });

  it("handles a mixed adult and child party", () => {
    const party = buildDeliveryParty(
      {
        graduateFullName: "Grad",
        registeredAdultGuests: 3,
        registeredChildren04: 1,
        registeredChildren510: 2,
      },
      guests(["A", "B", "C"])
    );
    expect(party.totalPartyCount).toBe(1 + 3 + 1 + 2);
  });

  it("preserves long adult guest names", () => {
    const longName =
      "Alexandria Bartholomew Christopherson-Wentworth the Third Esquire";
    const party = buildDeliveryParty(
      {
        graduateFullName: "Grad",
        registeredAdultGuests: 1,
        registeredChildren04: 0,
        registeredChildren510: 0,
      },
      guests([longName])
    );
    expect(party.adultGuestNames[0]).toBe(longName);
  });
});

describe("party snapshot round trip", () => {
  it("reads and writes the snake_case snapshot shape", () => {
    const party = buildDeliveryParty(
      {
        graduateFullName: "Grad",
        registeredAdultGuests: 2,
        registeredChildren04: 1,
        registeredChildren510: 0,
      },
      guests(["A", "B"])
    );
    const roundTripped = readPartySnapshot(writePartySnapshot(party));
    expect(roundTripped).toEqual(party);
  });
});

describe("guest flexibility audit", () => {
  it("reports the distribution layer as uncapped", () => {
    expect(auditGuestFlexibility().distributionUncapped).toBe(true);
  });

  it("reports the upstream two-guest schema limit as a production blocker", () => {
    const result = auditGuestFlexibility();
    expect(result.hasProductionBlocker).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    const adultLimit = result.findings.find(
      (finding) => finding.constraint === "graduation_registrations_adults_range"
    );
    expect(adultLimit?.limit).toBe(2);
  });
});
