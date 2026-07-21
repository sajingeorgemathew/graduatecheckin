/**
 * Authorization for the PDF document administration surface.
 *
 * PDF administration reuses the existing ticket permission rules, so a
 * scanner or supervisor can never reach it. All fixtures are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  canManageTickets,
  hasTicketAccess,
} from "@/features/tickets/permissions";
import type { StaffSession } from "@/features/auth/types";
import type { StaffRole } from "@/types/database";

function session(overrides: Partial<StaffSession> = {}): StaffSession {
  return {
    userId: "11111111-2222-4333-8444-555555555555",
    email: "staff@example.invalid",
    displayName: "Test Staff",
    role: "administrator",
    isActive: true,
    mustChangePassword: false,
    ...overrides,
  } as StaffSession;
}

describe("pdf document administration access", () => {
  it("allows an active administrator", () => {
    expect(hasTicketAccess(session())).toBe(true);
    expect(canManageTickets("administrator")).toBe(true);
  });

  it("denies a scanner", () => {
    expect(hasTicketAccess(session({ role: "scanner" as StaffRole }))).toBe(false);
    expect(canManageTickets("scanner" as StaffRole)).toBe(false);
  });

  it("denies a supervisor", () => {
    expect(hasTicketAccess(session({ role: "supervisor" as StaffRole }))).toBe(
      false
    );
    expect(canManageTickets("supervisor" as StaffRole)).toBe(false);
  });

  it("denies an anonymous caller", () => {
    expect(hasTicketAccess(null)).toBe(false);
  });

  it("denies a deactivated administrator", () => {
    expect(hasTicketAccess(session({ isActive: false }))).toBe(false);
  });

  it("denies an administrator who must still change their password", () => {
    expect(hasTicketAccess(session({ mustChangePassword: true }))).toBe(false);
  });
});
