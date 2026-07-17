import { describe, expect, it } from "vitest";
import {
  canAccessAdmin,
  canImportRegistrations,
  canManageStaff,
  hasMinimumRole,
} from "@/features/auth/permissions";

describe("role hierarchy", () => {
  it("uses the explicit hierarchy, not alphabetical order", () => {
    // Alphabetically administrator sorts before scanner; the hierarchy
    // must still place administrator above every other role.
    expect(hasMinimumRole("administrator", "scanner")).toBe(true);
    expect(hasMinimumRole("scanner", "administrator")).toBe(false);
  });

  it("orders scanner below supervisor below administrator", () => {
    expect(hasMinimumRole("scanner", "scanner")).toBe(true);
    expect(hasMinimumRole("scanner", "supervisor")).toBe(false);
    expect(hasMinimumRole("supervisor", "scanner")).toBe(true);
    expect(hasMinimumRole("supervisor", "supervisor")).toBe(true);
    expect(hasMinimumRole("supervisor", "administrator")).toBe(false);
    expect(hasMinimumRole("administrator", "supervisor")).toBe(true);
    expect(hasMinimumRole("administrator", "administrator")).toBe(true);
  });

  it("restricts admin capabilities to administrators", () => {
    expect(canAccessAdmin("administrator")).toBe(true);
    expect(canAccessAdmin("supervisor")).toBe(false);
    expect(canAccessAdmin("scanner")).toBe(false);

    expect(canManageStaff("administrator")).toBe(true);
    expect(canManageStaff("supervisor")).toBe(false);
    expect(canManageStaff("scanner")).toBe(false);

    expect(canImportRegistrations("administrator")).toBe(true);
    expect(canImportRegistrations("supervisor")).toBe(false);
    expect(canImportRegistrations("scanner")).toBe(false);
  });
});
