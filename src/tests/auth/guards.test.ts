import { describe, expect, it } from "vitest";
import { evaluateRoleGuard } from "@/features/auth/guards";
import { evaluateStaffAccess } from "@/features/auth/session";
import type { SessionResolution } from "@/features/auth/types";
import {
  FICTIONAL_TARGET_ID,
  fictionalProfile,
  fictionalSession,
} from "./helpers";

function activeResolution(
  role: "scanner" | "supervisor" | "administrator",
  mustChangePassword = false
): SessionResolution {
  return {
    kind: "active",
    session: fictionalSession(role, { mustChangePassword }),
  };
}

describe("session resolution", () => {
  it("treats a missing auth user as anonymous", () => {
    expect(evaluateStaffAccess(null, null)).toEqual({ kind: "anonymous" });
  });

  it("rejects a verified user without a staff profile", () => {
    const result = evaluateStaffAccess(
      { id: FICTIONAL_TARGET_ID, email: "fictional@example.com" },
      null
    );
    expect(result.kind).toBe("no_profile");
  });

  it("rejects a profile that belongs to a different user", () => {
    const result = evaluateStaffAccess(
      { id: "00000000-0000-4000-8000-0000000000ff", email: null },
      fictionalProfile()
    );
    expect(result.kind).toBe("no_profile");
  });

  it("rejects an inactive staff profile", () => {
    const result = evaluateStaffAccess(
      { id: FICTIONAL_TARGET_ID, email: "fictional@example.com" },
      fictionalProfile({ is_active: false })
    );
    expect(result.kind).toBe("inactive");
  });

  it("builds a trusted session with a normalized email", () => {
    const result = evaluateStaffAccess(
      { id: FICTIONAL_TARGET_ID, email: "  Fictional.Staff@Example.COM " },
      fictionalProfile({ role: "supervisor", must_change_password: true })
    );
    expect(result.kind).toBe("active");
    if (result.kind === "active") {
      expect(result.session).toEqual({
        userId: FICTIONAL_TARGET_ID,
        email: "fictional.staff@example.com",
        displayName: "Fictional Staff",
        role: "supervisor",
        isActive: true,
        mustChangePassword: true,
      });
    }
  });
});

describe("role guards", () => {
  it("returns 401 for anonymous callers on staff and admin areas", () => {
    for (const minimum of ["scanner", "administrator"] as const) {
      const guard = evaluateRoleGuard({ kind: "anonymous" }, minimum);
      expect(guard.ok).toBe(false);
      if (!guard.ok) {
        expect(guard.status).toBe(401);
        expect(guard.code).toBe("not_authenticated");
      }
    }
  });

  it("returns 403 for missing and inactive profiles with one message", () => {
    const missing = evaluateRoleGuard(
      { kind: "no_profile", userId: FICTIONAL_TARGET_ID },
      "scanner"
    );
    const inactive = evaluateRoleGuard(
      { kind: "inactive", userId: FICTIONAL_TARGET_ID },
      "scanner"
    );
    expect(missing.ok).toBe(false);
    expect(inactive.ok).toBe(false);
    if (!missing.ok && !inactive.ok) {
      expect(missing.status).toBe(403);
      expect(inactive.status).toBe(403);
      // The identical message never reveals which accounts exist.
      expect(missing.message).toBe(inactive.message);
    }
  });

  it("blocks scanners and supervisors from administrator areas", () => {
    for (const role of ["scanner", "supervisor"] as const) {
      const guard = evaluateRoleGuard(activeResolution(role), "administrator");
      expect(guard.ok).toBe(false);
      if (!guard.ok) {
        expect(guard.status).toBe(403);
        expect(guard.code).toBe("not_authorized");
      }
    }
  });

  it("allows every active role into the staff area", () => {
    for (const role of ["scanner", "supervisor", "administrator"] as const) {
      expect(evaluateRoleGuard(activeResolution(role), "scanner").ok).toBe(true);
    }
  });

  it("allows administrators into administrator areas", () => {
    expect(
      evaluateRoleGuard(activeResolution("administrator"), "administrator").ok
    ).toBe(true);
  });

  it("blocks protected areas while a password change is required", () => {
    const guard = evaluateRoleGuard(
      activeResolution("administrator", true),
      "administrator"
    );
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.code).toBe("password_change_required");
    }
  });

  it("permits the change-password flow while the change is required", () => {
    const guard = evaluateRoleGuard(
      activeResolution("scanner", true),
      "scanner",
      { allowPasswordChangeRequired: true }
    );
    expect(guard.ok).toBe(true);
  });
});
