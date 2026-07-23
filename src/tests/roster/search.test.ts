/**
 * The future full graduate roster.
 *
 * A roster candidate is not an event registration and never holds a
 * ticket. All data below is synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  searchRosterCandidates,
  type RosterCandidateView,
} from "@/features/roster/search";

const candidates: RosterCandidateView[] = [
  {
    candidateId: "a",
    studentId: "S-1001",
    fullName: "Amara Osei",
    email: "amara.osei@example.com",
    phone: "4165550123",
    program: "Business Administration",
    batch: "2026-Spring",
    registrationId: null,
  },
  {
    candidateId: "b",
    studentId: "S-2002",
    fullName: "Nikhil Varma",
    email: "nikhil.varma@example.com",
    phone: "4165550999",
    program: "Health Sciences",
    batch: "2026-Fall",
    registrationId: "44444444-4444-4444-8444-444444444444",
  },
];

const ids = (search: string) =>
  searchRosterCandidates(candidates, search).map((row) => row.candidateId);

describe("roster search", () => {
  it("matches on student ID", () => {
    expect(ids("S-2002")).toEqual(["b"]);
  });

  it("matches on name and email", () => {
    expect(ids("amara")).toEqual(["a"]);
    expect(ids("nikhil.varma@example.com")).toEqual(["b"]);
  });

  it("matches on phone digits regardless of formatting", () => {
    expect(ids("(416) 555-0123")).toEqual(["a"]);
  });

  it("matches on program and batch", () => {
    expect(ids("health")).toEqual(["b"]);
    expect(ids("2026-spring")).toEqual(["a"]);
  });

  it("returns everything for a blank search", () => {
    expect(ids("")).toHaveLength(2);
  });
});

describe("roster candidates stay separate from registrations", () => {
  it("records whether a candidate has become a registration", () => {
    expect(candidates[0].registrationId).toBeNull();
    expect(candidates[1].registrationId).not.toBeNull();
  });
});
