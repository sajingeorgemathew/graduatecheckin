/**
 * Manually added graduates: late RSVPs, missing RSVPs and walk-ins.
 *
 * Duplicate detection warns, it never blocks. An administrator who knows
 * the two records are different people overrides with a recorded reason.
 *
 * All data below is synthetic and uses the reserved example.com domain and
 * the reserved 555-01xx phone range.
 */

import { describe, expect, it } from "vitest";

import {
  findDuplicateWarnings,
  namesAreSimilar,
  type ExistingGraduate,
} from "@/features/registrations/duplicate-detection";
import {
  manualRegistrationSchema,
  MANUAL_REGISTRATION_SOURCES,
} from "@/features/registrations/schemas";

const existing: ExistingGraduate[] = [
  {
    registrationId: "a",
    graduateFullName: "Amara Osei",
    email: "amara.osei@example.com",
    phone: "4165550123",
    studentId: "S-1001",
  },
  {
    registrationId: "b",
    graduateFullName: "Nikhil Varma",
    email: "nikhil.varma@example.com",
    phone: "4165550999",
    studentId: null,
  },
];

const signals = (candidate: Parameters<typeof findDuplicateWarnings>[0]) =>
  findDuplicateWarnings(candidate, existing).map((warning) => warning.signal);

describe("duplicate warnings", () => {
  it("warns about a repeated email address", () => {
    expect(
      signals({
        graduateFullName: "A. Osei",
        email: "AMARA.OSEI@example.com",
        phone: null,
        studentId: null,
      })
    ).toContain("same_email");
  });

  it("warns about a repeated phone number regardless of formatting", () => {
    expect(
      signals({
        graduateFullName: "Different Person",
        email: null,
        phone: "(416) 555-0123",
        studentId: null,
      })
    ).toContain("same_phone");
  });

  it("warns about a repeated student ID", () => {
    expect(
      signals({
        graduateFullName: "Different Person",
        email: null,
        phone: null,
        studentId: "s-1001",
      })
    ).toContain("same_student_id");
  });

  it("warns about a very similar name", () => {
    expect(
      signals({
        graduateFullName: "Osei, Amara",
        email: null,
        phone: null,
        studentId: null,
      })
    ).toContain("similar_name");
  });

  it("stays quiet for a genuinely new graduate", () => {
    expect(
      signals({
        graduateFullName: "Sofia Duarte",
        email: "sofia.duarte@example.com",
        phone: "4165550777",
        studentId: "S-2002",
      })
    ).toEqual([]);
  });

  it("ignores a short digit string that would match too easily", () => {
    expect(
      signals({
        graduateFullName: "Sofia Duarte",
        email: null,
        phone: "0123",
        studentId: null,
      })
    ).toEqual([]);
  });

  it("names the existing graduate so the administrator can compare", () => {
    const warnings = findDuplicateWarnings(
      {
        graduateFullName: "Amara Osei",
        email: "amara.osei@example.com",
        phone: null,
        studentId: null,
      },
      existing
    );
    expect(warnings[0].existingName).toBe("Amara Osei");
    expect(warnings[0].registrationId).toBe("a");
  });
});

describe("name similarity", () => {
  it("matches a reordered or punctuated name", () => {
    expect(namesAreSimilar("Priya Raman", "Raman, Priya")).toBe(true);
    expect(namesAreSimilar("Amara Osei", "amara  osei")).toBe(true);
  });

  it("does not match two different people who share one name part", () => {
    expect(namesAreSimilar("Amara Osei", "Kwame Osei")).toBe(false);
    expect(namesAreSimilar("Amara Osei", "Nikhil Varma")).toBe(false);
  });
});

describe("manual registration input", () => {
  const base = {
    graduateFullName: "Sofia Duarte",
    adultGuestNames: [],
    adultGuestCount: 0,
    children04: 0,
    children510: 0,
    source: "late_rsvp" as const,
  };

  it("accepts a walk-in with no email address and no PDF", () => {
    const parsed = manualRegistrationSchema.safeParse({
      ...base,
      source: "walk_in",
      email: "",
      phone: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBeNull();
    }
  });

  it("supports every documented arrival route", () => {
    expect([...MANUAL_REGISTRATION_SOURCES]).toEqual([
      "late_rsvp",
      "missing_rsvp",
      "admin_added",
      "walk_in",
      "roster",
    ]);
  });

  it("enforces the registration guest and child limits", () => {
    expect(
      manualRegistrationSchema.safeParse({ ...base, adultGuestCount: 3 })
        .success
    ).toBe(false);
    expect(
      manualRegistrationSchema.safeParse({
        ...base,
        children04: 2,
        children510: 1,
      }).success
    ).toBe(false);
    expect(
      manualRegistrationSchema.safeParse({
        ...base,
        children04: 1,
        children510: 1,
      }).success
    ).toBe(true);
  });

  it("rejects more guest names than approved adult guests", () => {
    expect(
      manualRegistrationSchema.safeParse({
        ...base,
        adultGuestCount: 1,
        adultGuestNames: ["Kwame Osei", "Ines Reyes"],
      }).success
    ).toBe(false);
  });

  it("carries an override acknowledgement and reason", () => {
    const parsed = manualRegistrationSchema.safeParse({
      ...base,
      acknowledgeDuplicates: true,
      overrideReason: "Twin sibling, confirmed with the registrar",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.acknowledgeDuplicates).toBe(true);
      expect(parsed.data.overrideReason).toBe(
        "Twin sibling, confirmed with the registrar"
      );
    }
  });
});
