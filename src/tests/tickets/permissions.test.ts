import { describe, expect, it } from "vitest";

import type { StaffSession } from "@/features/auth/types";
import {
  canManageTickets,
  hasTicketAccess,
} from "@/features/tickets/permissions";

function session(overrides: Partial<StaffSession> = {}): StaffSession {
  return {
    userId: "11111111-2222-4333-8444-555555555555",
    email: "fictional.staff@example.com",
    displayName: "Fictional Staff",
    role: "administrator",
    isActive: true,
    mustChangePassword: false,
    ...overrides,
  };
}

describe("ticket permissions", () => {
  it("allows administrators only", () => {
    expect(canManageTickets("administrator")).toBe(true);
    expect(canManageTickets("supervisor")).toBe(false);
    expect(canManageTickets("scanner")).toBe(false);
  });

  it("grants access to an active administrator", () => {
    expect(hasTicketAccess(session())).toBe(true);
  });

  it("denies anonymous callers", () => {
    expect(hasTicketAccess(null)).toBe(false);
  });

  it("denies scanners and supervisors", () => {
    expect(hasTicketAccess(session({ role: "scanner" }))).toBe(false);
    expect(hasTicketAccess(session({ role: "supervisor" }))).toBe(false);
  });

  it("denies inactive staff", () => {
    expect(hasTicketAccess(session({ isActive: false }))).toBe(false);
  });

  it("denies staff with a required password change pending", () => {
    expect(hasTicketAccess(session({ mustChangePassword: true }))).toBe(false);
  });
});
