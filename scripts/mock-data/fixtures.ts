/**
 * Source of truth for fictional development data.
 *
 * Every value in this file is visibly fictional. No real graduate, guest,
 * contact or payment information may ever appear here. All records are
 * marked is_test: true so destructive development tooling can verify it is
 * operating on test data only.
 *
 * UUIDs are deterministic so seeding is repeatable and idempotent.
 */

import type {
  GuestCategory,
  PaymentStatus,
  RegistrationSource,
  RegistrationStatus,
} from "../../src/types/database";

export const MOCK_EVENT_CODE = "GRAD-2026-DEV";

export interface MockEvent {
  id: string;
  event_code: string;
  event_name: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  venue_name: string;
  venue_address: string;
  status: "draft";
  is_test: true;
}

export interface MockRegistration {
  id: string;
  event_id: string;
  registration_code: string;
  source_system: RegistrationSource;
  source_registration_id: string;
  graduate_full_name: string;
  email: string;
  phone: string;
  gown_size: string | null;
  name_pronunciation: string | null;
  registered_adult_guests: number;
  registered_children_0_4: number;
  registered_children_5_10: number;
  registration_status: RegistrationStatus;
  payment_status: PaymentStatus;
  fee_total: number | null;
  tax_total: number | null;
  order_total: number | null;
  source_order_date: string;
  internal_notes: string;
  is_test: true;
}

export interface MockGuest {
  id: string;
  registration_id: string;
  guest_category: GuestCategory;
  guest_name: string | null;
  sort_order: number;
  is_test: true;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function registrationId(index: number): string {
  return `00000000-0000-4000-8000-0000000001${pad2(index)}`;
}

function guestId(index: number): string {
  return `00000000-0000-4000-8000-0000000002${pad2(index)}`;
}

export const mockEvent: MockEvent = {
  id: "00000000-0000-4000-8000-000000000001",
  event_code: MOCK_EVENT_CODE,
  event_name: "Graduation Check-In Development Event",
  starts_at: "2026-06-25T22:00:00.000Z",
  ends_at: "2026-06-26T01:00:00.000Z",
  timezone: "America/Toronto",
  venue_name: "Fictional Test Auditorium",
  venue_address: "123 Example Street, Toronto, ON",
  status: "draft",
  is_test: true,
};

interface ScenarioDefinition {
  adults: number;
  children0to4: number;
  children5to10: number;
  registrationStatus: RegistrationStatus;
  paymentStatus: PaymentStatus;
  feeTotal: number | null;
  taxTotal: number | null;
  orderTotal: number | null;
  gownSize: string | null;
  namePronunciation: string | null;
  sharedEmail?: string;
  note: string;
}

const SHARED_DUPLICATE_EMAIL = "shared.family@example.com";

/**
 * The 20 required mock scenarios. Index position 0 is registration 001.
 * Party limits: at most 2 adult guests and at most 2 combined children.
 */
const scenarios: ScenarioDefinition[] = [
  {
    adults: 0,
    children0to4: 0,
    children5to10: 0,
    registrationStatus: "eligible",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: "M",
    namePronunciation: null,
    note: "Scenario 01: graduate attending alone.",
  },
  {
    adults: 1,
    children0to4: 0,
    children5to10: 0,
    registrationStatus: "eligible",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: "L",
    namePronunciation: null,
    note: "Scenario 02: one adult guest.",
  },
  {
    adults: 2,
    children0to4: 0,
    children5to10: 0,
    registrationStatus: "eligible",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: "S",
    namePronunciation: null,
    note: "Scenario 03: two adult guests.",
  },
  {
    adults: 0,
    children0to4: 1,
    children5to10: 0,
    registrationStatus: "eligible",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: "M",
    namePronunciation: null,
    note: "Scenario 04: one child aged 0 to 4.",
  },
  {
    adults: 0,
    children0to4: 2,
    children5to10: 0,
    registrationStatus: "eligible",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: "XL",
    namePronunciation: null,
    note: "Scenario 05: two children aged 0 to 4.",
  },
  {
    adults: 0,
    children0to4: 0,
    children5to10: 1,
    registrationStatus: "eligible",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: "M",
    namePronunciation: null,
    note: "Scenario 06: one child aged 5 to 10.",
  },
  {
    adults: 0,
    children0to4: 0,
    children5to10: 2,
    registrationStatus: "eligible",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: "L",
    namePronunciation: null,
    note: "Scenario 07: two children aged 5 to 10.",
  },
  {
    adults: 0,
    children0to4: 1,
    children5to10: 1,
    registrationStatus: "eligible",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: "S",
    namePronunciation: null,
    note: "Scenario 08: one child in each age group.",
  },
  {
    adults: 1,
    children0to4: 0,
    children5to10: 1,
    registrationStatus: "eligible",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: "M",
    namePronunciation: null,
    note: "Scenario 09: one adult guest and one child.",
  },
  {
    adults: 2,
    children0to4: 1,
    children5to10: 1,
    registrationStatus: "eligible",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: "L",
    namePronunciation: null,
    note: "Scenario 10: two adult guests and two children.",
  },
  {
    adults: 1,
    children0to4: 0,
    children5to10: 0,
    registrationStatus: "eligible",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: "M",
    namePronunciation: null,
    note: "Scenario 11: payment status unknown.",
  },
  {
    adults: 2,
    children0to4: 0,
    children5to10: 0,
    registrationStatus: "eligible",
    paymentStatus: "amount_recorded",
    feeTotal: 75.0,
    taxTotal: 9.75,
    orderTotal: 84.75,
    gownSize: "L",
    namePronunciation: null,
    note: "Scenario 12: amount recorded from the source system.",
  },
  {
    adults: 1,
    children0to4: 1,
    children5to10: 0,
    registrationStatus: "eligible",
    paymentStatus: "pending",
    feeTotal: 50.0,
    taxTotal: 6.5,
    orderTotal: 56.5,
    gownSize: "S",
    namePronunciation: null,
    note: "Scenario 13: payment pending.",
  },
  {
    adults: 2,
    children0to4: 0,
    children5to10: 1,
    registrationStatus: "eligible",
    paymentStatus: "paid",
    feeTotal: 50.0,
    taxTotal: 6.5,
    orderTotal: 56.5,
    gownSize: "M",
    namePronunciation: null,
    note: "Scenario 14: payment paid.",
  },
  {
    adults: 1,
    children0to4: 0,
    children5to10: 0,
    registrationStatus: "review_required",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: "XL",
    namePronunciation: null,
    note: "Scenario 15: registration requiring review.",
  },
  {
    adults: 0,
    children0to4: 0,
    children5to10: 0,
    registrationStatus: "failed",
    paymentStatus: "failed",
    feeTotal: 50.0,
    taxTotal: 6.5,
    orderTotal: 56.5,
    gownSize: "M",
    namePronunciation: null,
    note: "Scenario 16: failed registration.",
  },
  {
    adults: 1,
    children0to4: 0,
    children5to10: 0,
    registrationStatus: "cancelled",
    paymentStatus: "refunded",
    feeTotal: 50.0,
    taxTotal: 6.5,
    orderTotal: 56.5,
    gownSize: "L",
    namePronunciation: null,
    note: "Scenario 17: cancelled registration.",
  },
  {
    adults: 2,
    children0to4: 0,
    children5to10: 0,
    registrationStatus: "eligible",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: null,
    namePronunciation: null,
    note: "Scenario 18: missing gown size.",
  },
  {
    adults: 1,
    children0to4: 0,
    children5to10: 1,
    registrationStatus: "eligible",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: "M",
    namePronunciation: "TEST grad-yoo-it nine-teen",
    sharedEmail: SHARED_DUPLICATE_EMAIL,
    note: "Scenario 19: name pronunciation provided.",
  },
  {
    adults: 1,
    children0to4: 1,
    children5to10: 0,
    registrationStatus: "eligible",
    paymentStatus: "unknown",
    feeTotal: null,
    taxTotal: null,
    orderTotal: null,
    gownSize: "S",
    namePronunciation: null,
    sharedEmail: SHARED_DUPLICATE_EMAIL,
    note: "Scenario 20: shared fictional contact email for duplicate review.",
  },
];

export const mockRegistrations: MockRegistration[] = scenarios.map(
  (scenario, position) => {
    const index = position + 1;
    return {
      id: registrationId(index),
      event_id: mockEvent.id,
      registration_code: `REG-MOCK-${pad2(index).padStart(3, "0")}`,
      source_system: "mock",
      source_registration_id: `MOCK-${String(index).padStart(3, "0")}`,
      graduate_full_name: `Test Graduate ${String(index).padStart(3, "0")}`,
      email: scenario.sharedEmail ?? `graduate${String(index).padStart(3, "0")}@example.com`,
      phone: `41655501${pad2(index)}`,
      gown_size: scenario.gownSize,
      name_pronunciation: scenario.namePronunciation,
      registered_adult_guests: scenario.adults,
      registered_children_0_4: scenario.children0to4,
      registered_children_5_10: scenario.children5to10,
      registration_status: scenario.registrationStatus,
      payment_status: scenario.paymentStatus,
      fee_total: scenario.feeTotal,
      tax_total: scenario.taxTotal,
      order_total: scenario.orderTotal,
      source_order_date: `2026-05-${pad2(index)}T12:00:00.000Z`,
      internal_notes: scenario.note,
      is_test: true,
    };
  }
);

function buildMockGuests(): MockGuest[] {
  const guests: MockGuest[] = [];
  let nextGuestIndex = 1;

  for (const registration of mockRegistrations) {
    const registrationNumber = registration.registration_code.slice(-3);

    for (let slot = 1; slot <= registration.registered_adult_guests; slot++) {
      guests.push({
        id: guestId(nextGuestIndex),
        registration_id: registration.id,
        guest_category: "adult",
        guest_name: `Test Adult Guest ${registrationNumber}-${slot}`,
        sort_order: slot,
        is_test: true,
      });
      nextGuestIndex += 1;
    }

    // Children aged 0 to 4 are registered without names to exercise the
    // nullable guest_name column.
    for (let slot = 1; slot <= registration.registered_children_0_4; slot++) {
      guests.push({
        id: guestId(nextGuestIndex),
        registration_id: registration.id,
        guest_category: "child_0_4",
        guest_name: null,
        sort_order: slot,
        is_test: true,
      });
      nextGuestIndex += 1;
    }

    for (let slot = 1; slot <= registration.registered_children_5_10; slot++) {
      guests.push({
        id: guestId(nextGuestIndex),
        registration_id: registration.id,
        guest_category: "child_5_10",
        guest_name: `Test Child Guest ${registrationNumber}-${slot}`,
        sort_order: slot,
        is_test: true,
      });
      nextGuestIndex += 1;
    }
  }

  return guests;
}

export const mockGuests: MockGuest[] = buildMockGuests();

export function expectedPartySize(registration: MockRegistration): number {
  return (
    1 +
    registration.registered_adult_guests +
    registration.registered_children_0_4 +
    registration.registered_children_5_10
  );
}
