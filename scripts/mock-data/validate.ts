/**
 * Validates the fictional mock fixtures and the generated seed SQL.
 *
 * Prints pass or fail messages with counts only. Never prints fixture
 * names, emails, phones, UUIDs or secrets.
 */

import { buildSeedSql } from "./generate-seed-sql";
import {
  expectedPartySize,
  MOCK_EVENT_CODE,
  mockEvent,
  mockGuests,
  mockRegistrations,
} from "./fixtures";

type CheckFn = () => string | null;

const EMAIL_PATTERN = /^[a-z0-9._-]+@example\.com$/;
const PHONE_PATTERN = /^416555\d{4}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function allUnique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

const checks: Array<{ name: string; run: CheckFn }> = [
  {
    name: "Exactly one fictional development event",
    run: () =>
      mockEvent.event_code === MOCK_EVENT_CODE &&
      mockEvent.event_code === "GRAD-2026-DEV"
        ? null
        : "The event code does not match the development event code.",
  },
  {
    name: "Exactly 20 registrations",
    run: () =>
      mockRegistrations.length === 20
        ? null
        : `Expected 20 registrations, found ${mockRegistrations.length}.`,
  },
  {
    name: "All records are test records",
    run: () => {
      const records: Array<{ is_test: boolean }> = [
        mockEvent,
        ...mockRegistrations,
        ...mockGuests,
      ];
      const bad = records.filter((record) => record.is_test !== true).length;
      return bad === 0 ? null : `${bad} records are not marked is_test.`;
    },
  },
  {
    name: "All emails use example.com",
    run: () => {
      const bad = mockRegistrations.filter(
        (registration) => !EMAIL_PATTERN.test(registration.email)
      ).length;
      return bad === 0 ? null : `${bad} emails are not example.com addresses.`;
    },
  },
  {
    name: "All phones use the fictional test format",
    run: () => {
      const bad = mockRegistrations.filter(
        (registration) => !PHONE_PATTERN.test(registration.phone)
      ).length;
      return bad === 0 ? null : `${bad} phones are not in the test range.`;
    },
  },
  {
    name: "All source IDs begin with MOCK-",
    run: () => {
      const bad = mockRegistrations.filter(
        (registration) =>
          !registration.source_registration_id.startsWith("MOCK-")
      ).length;
      return bad === 0 ? null : `${bad} source IDs are not MOCK- prefixed.`;
    },
  },
  {
    name: "All UUIDs are valid and unique",
    run: () => {
      const ids = [
        mockEvent.id,
        ...mockRegistrations.map((registration) => registration.id),
        ...mockGuests.map((guest) => guest.id),
      ];
      if (!ids.every((id) => UUID_PATTERN.test(id))) {
        return "A fixture ID is not a valid lowercase UUID.";
      }
      return allUnique(ids) ? null : "Duplicate fixture UUIDs found.";
    },
  },
  {
    name: "All registration codes are unique",
    run: () =>
      allUnique(mockRegistrations.map((r) => r.registration_code))
        ? null
        : "Duplicate registration codes found.",
  },
  {
    name: "No adult guest count exceeds 2",
    run: () =>
      mockRegistrations.every(
        (r) => r.registered_adult_guests >= 0 && r.registered_adult_guests <= 2
      )
        ? null
        : "An adult guest count is out of range.",
  },
  {
    name: "No combined child count exceeds 2",
    run: () =>
      mockRegistrations.every(
        (r) =>
          r.registered_children_0_4 >= 0 &&
          r.registered_children_5_10 >= 0 &&
          r.registered_children_0_4 + r.registered_children_5_10 <= 2
      )
        ? null
        : "A combined child count is out of range.",
  },
  {
    name: "Expected party sizes are consistent",
    run: () =>
      mockRegistrations.every(
        (r) => expectedPartySize(r) >= 1 && expectedPartySize(r) <= 5
      )
        ? null
        : "An expected party size is out of range.",
  },
  {
    name: "No negative monetary value exists",
    run: () =>
      mockRegistrations.every((r) =>
        [r.fee_total, r.tax_total, r.order_total].every(
          (value) => value === null || value >= 0
        )
      )
        ? null
        : "A monetary value is negative.",
  },
  {
    name: "No raw ticket token and no ticket record exists",
    run: () => {
      const sql = buildSeedSql().toLowerCase();
      if (sql.includes("graduation_tickets") || sql.includes("token")) {
        return "Seed SQL references tickets or tokens.";
      }
      return null;
    },
  },
  {
    name: "No check-in record exists",
    run: () =>
      buildSeedSql().toLowerCase().includes("graduation_checkins")
        ? "Seed SQL references check-ins."
        : null,
  },
  {
    name: "No Auth user is created",
    run: () =>
      buildSeedSql().toLowerCase().includes("auth.users")
        ? "Seed SQL references Auth users."
        : null,
  },
  {
    name: "Failed and cancelled scenarios exist",
    run: () => {
      const statuses = new Set(
        mockRegistrations.map((r) => r.registration_status)
      );
      return statuses.has("failed") && statuses.has("cancelled")
        ? null
        : "Missing failed or cancelled registration scenario.";
    },
  },
  {
    name: "Review-required scenario exists",
    run: () =>
      mockRegistrations.some(
        (r) => r.registration_status === "review_required"
      )
        ? null
        : "Missing review-required registration scenario.",
  },
  {
    name: "Payment test conditions exist",
    run: () => {
      const statuses = new Set(mockRegistrations.map((r) => r.payment_status));
      const required = ["unknown", "amount_recorded", "pending", "paid"];
      const missing = required.filter((status) => !statuses.has(
        status as (typeof mockRegistrations)[number]["payment_status"]
      ));
      return missing.length === 0
        ? null
        : `Missing payment scenarios: ${missing.join(", ")}.`;
    },
  },
  {
    name: "Child age group is always child_5_10, never child_4_10",
    run: () => {
      const categories = new Set(mockGuests.map((guest) => guest.guest_category));
      const sql = buildSeedSql();
      if (sql.includes("child_4_10")) {
        return "Seed SQL contains the forbidden child_4_10 category.";
      }
      const allowed = new Set(["adult", "child_0_4", "child_5_10"]);
      return [...categories].every((category) => allowed.has(category))
        ? null
        : "A guest category is outside the approved list.";
    },
  },
];

function main(): void {
  const failures: string[] = [];

  for (const check of checks) {
    const failure = check.run();
    if (failure === null) {
      console.log(`PASS ${check.name}`);
    } else {
      console.error(`FAIL ${check.name}: ${failure}`);
      failures.push(check.name);
    }
  }

  console.log(
    `Validated 1 event, ${mockRegistrations.length} registrations, ` +
      `${mockGuests.length} guest rows.`
  );

  if (failures.length > 0) {
    console.error(`Mock validation failed: ${failures.length} checks failed.`);
    process.exitCode = 1;
  } else {
    console.log("Mock validation passed.");
  }
}

main();
