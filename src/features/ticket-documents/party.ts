/**
 * Registered-party normalization.
 *
 * One registration produces exactly one admission ticket covering the
 * graduate and every registered guest. No separate guest ticket exists.
 *
 * Source of truth:
 *  - Counts come from the graduation_registrations columns
 *    (registered_adult_guests, registered_children_0_4,
 *    registered_children_5_10), which the import pipeline maintains.
 *  - Names come from the normalized registration_guests rows.
 *
 * Raw Excel-import columns are never read here. Guest categories are never
 * inferred or reclassified: the enum values adult / child_0_4 / child_5_10
 * map one-to-one onto the confirmed display categories.
 *
 * A guest whose name was not supplied still counts, but never renders an
 * empty name line.
 */

import type { Json } from "@/types/database";
import type { RegisteredParty } from "./types";

export interface RegistrationPartyInput {
  graduateFullName: string;
  registeredAdultGuests: number;
  registeredChildren04: number;
  registeredChildren510: number;
}

export interface GuestRecordInput {
  guestCategory: "adult" | "child_0_4" | "child_5_10";
  guestName: string | null;
  sortOrder: number;
}

function cleanName(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Builds the printable registered party. Adult guest names are ordered by
 * sort_order and limited to the registered adult count, so a stale extra
 * guest row can never inflate what the ticket shows.
 */
export function buildRegisteredParty(
  registration: RegistrationPartyInput,
  guests: readonly GuestRecordInput[]
): RegisteredParty {
  const adultGuestCount = nonNegative(registration.registeredAdultGuests);
  const children04Count = nonNegative(registration.registeredChildren04);
  const children510Count = nonNegative(registration.registeredChildren510);

  const adultGuestNames = guests
    .filter((guest) => guest.guestCategory === "adult")
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((guest) => cleanName(guest.guestName))
    .filter((name) => name.length > 0)
    .slice(0, adultGuestCount);

  return {
    graduateName: cleanName(registration.graduateFullName),
    graduateCount: 1,
    adultGuestNames,
    adultGuestCount,
    children04Count,
    children510Count,
    totalPartyCount:
      1 + adultGuestCount + children04Count + children510Count,
  };
}

/**
 * True when the registration records more adult guests than it has usable
 * names for. The ticket then shows the count without inventing a name.
 */
export function hasUnnamedAdultGuests(party: RegisteredParty): boolean {
  return party.adultGuestNames.length < party.adultGuestCount;
}

/**
 * True when a stored party snapshot (as written by partySnapshot, or by the
 * manual-send ledger and the party-adjustment audit, which use the same field
 * names) describes exactly the live registered party.
 *
 * This is the single comparison used for both stale-PDF detection and the
 * "party updated since last send" check, so the two can never disagree. A
 * null or malformed snapshot never matches, so a missing snapshot always reads
 * as changed. Guest names participate in their displayed order.
 */
export function partySnapshotMatchesParty(
  storedSnapshot: Json | null,
  party: RegisteredParty
): boolean {
  if (
    storedSnapshot === null ||
    typeof storedSnapshot !== "object" ||
    Array.isArray(storedSnapshot)
  ) {
    return false;
  }
  const snapshot = storedSnapshot as { [key: string]: Json | undefined };
  const storedNames = Array.isArray(snapshot.adult_guest_names)
    ? snapshot.adult_guest_names
    : [];
  return (
    snapshot.graduate_name === party.graduateName &&
    snapshot.adult_guest_count === party.adultGuestCount &&
    snapshot.child_0_4_count === party.children04Count &&
    snapshot.child_5_10_count === party.children510Count &&
    snapshot.total_party_count === party.totalPartyCount &&
    JSON.stringify(storedNames) === JSON.stringify(party.adultGuestNames)
  );
}

/** Human-readable summary used in list views and batch snapshots. */
export function describeParty(party: RegisteredParty): string {
  const parts = [`${party.graduateCount} graduate`];
  if (party.adultGuestCount > 0) {
    parts.push(
      `${party.adultGuestCount} adult guest${party.adultGuestCount === 1 ? "" : "s"}`
    );
  }
  if (party.children04Count > 0) {
    parts.push(`${party.children04Count} child 0-4`);
  }
  if (party.children510Count > 0) {
    parts.push(`${party.children510Count} child 5-10`);
  }
  return parts.join(", ");
}
