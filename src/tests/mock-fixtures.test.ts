import { describe, expect, it } from "vitest";

import {
  expectedPartySize,
  mockEvent,
  mockGuests,
  mockRegistrations,
} from "../../scripts/mock-data/fixtures";

describe("mock fixtures", () => {
  it("contains exactly 20 registrations", () => {
    expect(mockRegistrations).toHaveLength(20);
  });

  it("uses unique IDs across all fixtures", () => {
    const ids = [
      mockEvent.id,
      ...mockRegistrations.map((registration) => registration.id),
      ...mockGuests.map((guest) => guest.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses unique registration codes", () => {
    const codes = mockRegistrations.map((r) => r.registration_code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("uses unique mock source IDs", () => {
    const sourceIds = mockRegistrations.map((r) => r.source_registration_id);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
    for (const sourceId of sourceIds) {
      expect(sourceId).toMatch(/^MOCK-\d{3}$/);
    }
  });

  it("marks every record as visibly fictional test data", () => {
    expect(mockEvent.is_test).toBe(true);
    expect(mockEvent.event_code).toBe("GRAD-2026-DEV");
    for (const registration of mockRegistrations) {
      expect(registration.is_test).toBe(true);
      expect(registration.graduate_full_name).toMatch(/^Test Graduate \d{3}$/);
      expect(registration.source_system).toBe("mock");
    }
    for (const guest of mockGuests) {
      expect(guest.is_test).toBe(true);
      if (guest.guest_name !== null) {
        expect(guest.guest_name).toMatch(/^Test (Adult|Child) Guest /);
      }
    }
  });

  it("uses only example.com email addresses", () => {
    for (const registration of mockRegistrations) {
      expect(registration.email).toMatch(/^[a-z0-9._-]+@example\.com$/);
    }
  });

  it("uses only fictional test phone numbers", () => {
    for (const registration of mockRegistrations) {
      expect(registration.phone).toMatch(/^416555\d{4}$/);
    }
  });

  it("keeps adult guests within the limit of 2", () => {
    for (const registration of mockRegistrations) {
      expect(registration.registered_adult_guests).toBeGreaterThanOrEqual(0);
      expect(registration.registered_adult_guests).toBeLessThanOrEqual(2);
    }
  });

  it("keeps combined children within the limit of 2", () => {
    for (const registration of mockRegistrations) {
      expect(registration.registered_children_0_4).toBeGreaterThanOrEqual(0);
      expect(registration.registered_children_5_10).toBeGreaterThanOrEqual(0);
      expect(
        registration.registered_children_0_4 +
          registration.registered_children_5_10
      ).toBeLessThanOrEqual(2);
    }
  });

  it("calculates expected party size as graduate plus guests", () => {
    for (const registration of mockRegistrations) {
      expect(expectedPartySize(registration)).toBe(
        1 +
          registration.registered_adult_guests +
          registration.registered_children_0_4 +
          registration.registered_children_5_10
      );
    }
  });

  it("covers the required party composition scenarios", () => {
    const compositions = mockRegistrations.map((r) =>
      [
        r.registered_adult_guests,
        r.registered_children_0_4,
        r.registered_children_5_10,
      ].join("/")
    );
    expect(compositions).toContain("0/0/0");
    expect(compositions).toContain("1/0/0");
    expect(compositions).toContain("2/0/0");
    expect(compositions).toContain("0/1/0");
    expect(compositions).toContain("0/2/0");
    expect(compositions).toContain("0/0/1");
    expect(compositions).toContain("0/0/2");
    expect(compositions).toContain("0/1/1");
    expect(compositions).toContain("2/1/1");
  });

  it("covers the required payment-status scenarios", () => {
    const statuses = new Set(mockRegistrations.map((r) => r.payment_status));
    expect(statuses).toContain("unknown");
    expect(statuses).toContain("amount_recorded");
    expect(statuses).toContain("pending");
    expect(statuses).toContain("paid");
  });

  it("covers the required registration-status scenarios", () => {
    const statuses = new Set(
      mockRegistrations.map((r) => r.registration_status)
    );
    expect(statuses).toContain("eligible");
    expect(statuses).toContain("review_required");
    expect(statuses).toContain("failed");
    expect(statuses).toContain("cancelled");
  });

  it("covers missing gown size, pronunciation and shared email scenarios", () => {
    expect(
      mockRegistrations.some((r) => r.gown_size === null)
    ).toBe(true);
    expect(
      mockRegistrations.some((r) => r.name_pronunciation !== null)
    ).toBe(true);
    const emailCounts = new Map<string, number>();
    for (const registration of mockRegistrations) {
      emailCounts.set(
        registration.email,
        (emailCounts.get(registration.email) ?? 0) + 1
      );
    }
    expect([...emailCounts.values()].some((count) => count > 1)).toBe(true);
  });

  it("never uses the forbidden child_4_10 category", () => {
    for (const guest of mockGuests) {
      expect(["adult", "child_0_4", "child_5_10"]).toContain(
        guest.guest_category
      );
    }
  });

  it("contains no ticket or check-in records", () => {
    const fixtureModule: Record<string, unknown> = {
      mockEvent,
      mockRegistrations,
      mockGuests,
    };
    expect(Object.keys(fixtureModule)).not.toContain("mockTickets");
    expect(Object.keys(fixtureModule)).not.toContain("mockCheckins");
    for (const registration of mockRegistrations) {
      expect(registration).not.toHaveProperty("token");
      expect(registration).not.toHaveProperty("token_hash");
    }
  });
});
