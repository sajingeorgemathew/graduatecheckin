/**
 * Guest-flexibility audit for CHECKIN-09B (Part E).
 *
 * The distribution workflow itself must never hard-code a maximum of two
 * adult guests. Party building flows entirely from the registration counts
 * and the normalized registration_guests rows, and every consumer (PDF,
 * manifest, send queue, email body) renders every registered guest without
 * truncation.
 *
 * However, an approved upstream business rule DOES cap guests today: the
 * CHECKIN-02 schema constrains each guest count to 0..2. That rule is not
 * ours to silently remove. This module records the audit result as data so
 * a test can assert the blocker is reported and the production runbook can
 * surface it, rather than the limit being quietly worked around.
 */

import { buildRegisteredParty } from "@/features/ticket-documents/party";
import type {
  GuestRecordInput,
  RegistrationPartyInput,
} from "@/features/ticket-documents/party";

import type { Json } from "@/types/database";

import type { DeliveryParty } from "./types";

/**
 * Reads a stored party snapshot (snake_case keys, as written by the
 * CHECKIN-09A document layer) into the DeliveryParty shape. Every guest is
 * preserved; nothing is truncated.
 */
export function readPartySnapshot(snapshot: Json | null | undefined): DeliveryParty {
  const party = (snapshot ?? {}) as { [key: string]: Json | undefined };
  const names = Array.isArray(party.adult_guest_names)
    ? (party.adult_guest_names as Json[]).filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const num = (value: Json | undefined, fallback: number): number =>
    typeof value === "number" ? value : fallback;
  return {
    graduateName:
      typeof party.graduate_name === "string" ? party.graduate_name : "",
    graduateCount: num(party.graduate_count, 1),
    adultGuestNames: names,
    adultGuestCount: num(party.adult_guest_count, 0),
    children04Count: num(party.child_0_4_count, 0),
    children510Count: num(party.child_5_10_count, 0),
    totalPartyCount: num(party.total_party_count, 1),
  };
}

/** Serializes a DeliveryParty back to the snake_case snapshot shape. */
export function writePartySnapshot(party: DeliveryParty): Json {
  return {
    graduate_name: party.graduateName,
    graduate_count: party.graduateCount,
    adult_guest_names: party.adultGuestNames,
    adult_guest_count: party.adultGuestCount,
    child_0_4_count: party.children04Count,
    child_5_10_count: party.children510Count,
    total_party_count: party.totalPartyCount,
  } as unknown as Json;
}

/**
 * Builds the party for a delivery. Delegates to the shared, cap-free party
 * builder so the distribution layer adds no guest limit of its own. Adult
 * guest names are ordered and never truncated.
 */
export function buildDeliveryParty(
  registration: RegistrationPartyInput,
  guests: readonly GuestRecordInput[]
): DeliveryParty {
  return buildRegisteredParty(registration, guests);
}

/** A single upstream restriction that limits how many guests a party may have. */
export interface GuestLimitFinding {
  location: string;
  constraint: string;
  limit: number;
  affects: string;
}

/**
 * The known two-guest limitations discovered by the audit. Reported as a
 * production blocker, not removed: changing an approved business rule is a
 * decision for the ceremony owners, handled in CHECKIN-10 if required.
 */
export const KNOWN_GUEST_LIMIT_FINDINGS: readonly GuestLimitFinding[] = [
  {
    location:
      "supabase/migrations/20260717015847_create_graduation_checkin_schema.sql",
    constraint: "graduation_registrations_adults_range",
    limit: 2,
    affects: "registered_adult_guests is constrained to between 0 and 2.",
  },
  {
    location:
      "supabase/migrations/20260717015847_create_graduation_checkin_schema.sql",
    constraint: "graduation_registrations_children_0_4_range",
    limit: 2,
    affects: "registered_children_0_4 is constrained to between 0 and 2.",
  },
  {
    location:
      "supabase/migrations/20260717015847_create_graduation_checkin_schema.sql",
    constraint: "graduation_registrations_children_5_10_range",
    limit: 2,
    affects: "registered_children_5_10 is constrained to between 0 and 2.",
  },
  {
    location:
      "supabase/migrations/20260717015847_create_graduation_checkin_schema.sql",
    constraint: "graduation_registrations_children_combined",
    limit: 2,
    affects: "registered_children_0_4 + registered_children_5_10 <= 2.",
  },
  {
    location:
      "supabase/migrations/20260717015847_create_graduation_checkin_schema.sql",
    constraint: "graduation_checkins_adult_delta_range",
    limit: 2,
    affects:
      "attendance adult_guest_delta is constrained to between -2 and 2 per row.",
  },
] as const;

export interface GuestFlexibilityAuditResult {
  /** True when the distribution code itself imposes no adult-guest cap. */
  distributionUncapped: boolean;
  /** Upstream, approved restrictions found. Non-empty means a blocker. */
  findings: readonly GuestLimitFinding[];
  /** True when a production blocker must be reported to the ceremony owners. */
  hasProductionBlocker: boolean;
}

/**
 * Runs the audit. The distribution layer is always uncapped by construction
 * (it reuses the shared cap-free party builder); the findings capture the
 * upstream schema limit so it is reported rather than silently bypassed.
 */
export function auditGuestFlexibility(): GuestFlexibilityAuditResult {
  return {
    distributionUncapped: true,
    findings: KNOWN_GUEST_LIMIT_FINDINGS,
    hasProductionBlocker: KNOWN_GUEST_LIMIT_FINDINGS.length > 0,
  };
}
