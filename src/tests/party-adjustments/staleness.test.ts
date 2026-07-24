/**
 * Stale-PDF detection and the resend recommendation.
 *
 * The desk must never present an outdated PDF as ready to send, and it must
 * recommend a resend when the party has moved on from the latest recorded
 * send. Both are pure derivations over already-loaded snapshots.
 */

import { describe, expect, it } from "vitest";

import { partySnapshotMatchesParty } from "@/features/ticket-documents/party";
import { partyChangedSinceSendSnapshot } from "@/features/manual-delivery/summaries";
import type { RegisteredParty } from "@/features/ticket-documents/types";
import type { Json } from "@/types/database";

const party: RegisteredParty = {
  graduateName: "Amara Osei",
  graduateCount: 1,
  adultGuestNames: ["Kwame Osei", "Nia Osei"],
  adultGuestCount: 2,
  children04Count: 1,
  children510Count: 0,
  totalPartyCount: 4,
};

/** A ticket-document party snapshot (includes names). */
function documentSnapshot(overrides: Record<string, unknown> = {}): Json {
  return {
    graduate_name: "Amara Osei",
    graduate_count: 1,
    adult_guest_names: ["Kwame Osei", "Nia Osei"],
    adult_guest_count: 2,
    child_0_4_count: 1,
    child_5_10_count: 0,
    total_party_count: 4,
    ...overrides,
  } as unknown as Json;
}

/** A manual-send party snapshot (counts only, no names). */
function sendSnapshot(overrides: Record<string, unknown> = {}): Json {
  return {
    graduate_count: 1,
    adult_guest_count: 2,
    child_0_4_count: 1,
    child_5_10_count: 0,
    total_party_count: 4,
    ...overrides,
  } as unknown as Json;
}

const live = {
  adultGuestCount: party.adultGuestCount,
  children04Count: party.children04Count,
  children510Count: party.children510Count,
  totalPartyCount: party.totalPartyCount,
};

describe("PDF staleness", () => {
  it("reads a matching snapshot as current", () => {
    expect(partySnapshotMatchesParty(documentSnapshot(), party)).toBe(true);
  });

  it("reads a changed count as outdated", () => {
    expect(
      partySnapshotMatchesParty(
        documentSnapshot({ adult_guest_count: 1, total_party_count: 3 }),
        party
      )
    ).toBe(false);
  });

  it("reads a changed guest name as outdated", () => {
    expect(
      partySnapshotMatchesParty(
        documentSnapshot({ adult_guest_names: ["Kwame Osei", "Other Name"] }),
        party
      )
    ).toBe(false);
  });

  it("reads a missing snapshot as outdated", () => {
    expect(partySnapshotMatchesParty(null, party)).toBe(false);
  });
});

describe("party updated since last send", () => {
  it("is unchanged when the send snapshot matches the live counts", () => {
    expect(partyChangedSinceSendSnapshot(sendSnapshot(), live)).toBe(false);
  });

  it("is changed when the latest send carries an older party", () => {
    expect(
      partyChangedSinceSendSnapshot(
        sendSnapshot({ adult_guest_count: 1, total_party_count: 3 }),
        live
      )
    ).toBe(true);
  });

  it("treats a missing send snapshot as changed", () => {
    expect(partyChangedSinceSendSnapshot(null, live)).toBe(true);
  });
});

describe("resend recommendation", () => {
  // resendRecommended = partyUpdatedSinceLastSend && pdfStatus === "current".
  function derive(sendSnap: Json, docSnap: Json | null) {
    const partyUpdatedSinceLastSend = partyChangedSinceSendSnapshot(
      sendSnap,
      live
    );
    const pdfStatus =
      docSnap === null
        ? "missing"
        : partySnapshotMatchesParty(docSnap, party)
          ? "current"
          : "outdated";
    return {
      partyUpdatedSinceLastSend,
      resendRecommended:
        partyUpdatedSinceLastSend && pdfStatus === "current",
    };
  }

  it("recommends a resend when an old send lags a current PDF", () => {
    const state = derive(
      sendSnapshot({ adult_guest_count: 1, total_party_count: 3 }),
      documentSnapshot()
    );
    expect(state.partyUpdatedSinceLastSend).toBe(true);
    expect(state.resendRecommended).toBe(true);
  });

  it("does not recommend a resend while the PDF is still outdated", () => {
    const state = derive(
      sendSnapshot({ adult_guest_count: 1, total_party_count: 3 }),
      documentSnapshot({ adult_guest_count: 1, total_party_count: 3 })
    );
    expect(state.partyUpdatedSinceLastSend).toBe(true);
    expect(state.resendRecommended).toBe(false);
  });

  it("clears the recommendation once the resend snapshot matches", () => {
    const state = derive(sendSnapshot(), documentSnapshot());
    expect(state.partyUpdatedSinceLastSend).toBe(false);
    expect(state.resendRecommended).toBe(false);
  });
});
