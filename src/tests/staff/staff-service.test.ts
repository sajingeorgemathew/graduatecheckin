import { describe, expect, it } from "vitest";
import { isPasswordCompliant } from "@/features/auth/password-policy";
import type { StaffAuditEvent } from "@/features/staff/audit";
import type { StaffServiceDeps } from "@/features/staff/repository";
import {
  changeStaffRole,
  createStaffAccount,
  parseAccessChangeResult,
  resetStaffTemporaryPassword,
  setStaffActive,
} from "@/features/staff/service";
import type { Json, StaffProfileInsert, StaffProfileRow } from "@/types/database";
import {
  FICTIONAL_TARGET_ID,
  fictionalProfile,
  fictionalSession,
} from "../auth/helpers";

interface FakeDepsOptions {
  existingByEmail?: StaffProfileRow | null;
  targetProfile?: StaffProfileRow | null;
  createAuthUserResult?:
    | { ok: true; userId: string }
    | { ok: false; code: "email_exists" | "failed" };
  insertProfileFails?: boolean;
  updatePasswordSucceeds?: boolean;
  accessChangeResult?: Json;
}

interface FakeDeps extends StaffServiceDeps {
  createdAuthUsers: { email: string; password: string }[];
  deletedAuthUsers: string[];
  insertedProfiles: StaffProfileInsert[];
  passwordUpdates: { userId: string; password: string }[];
  mustChangeUpdates: { userId: string; value: boolean }[];
  auditEvents: StaffAuditEvent[];
}

function makeDeps(options: FakeDepsOptions = {}): FakeDeps {
  const deps: FakeDeps = {
    createdAuthUsers: [],
    deletedAuthUsers: [],
    insertedProfiles: [],
    passwordUpdates: [],
    mustChangeUpdates: [],
    auditEvents: [],
    async findStaffProfileByEmail() {
      return options.existingByEmail ?? null;
    },
    async getStaffProfile() {
      return options.targetProfile === undefined
        ? fictionalProfile()
        : options.targetProfile;
    },
    async insertStaffProfile(insert) {
      if (options.insertProfileFails === true) {
        throw new Error("fictional insert failure");
      }
      deps.insertedProfiles.push(insert);
    },
    async createAuthUser(email, password) {
      deps.createdAuthUsers.push({ email, password });
      return (
        options.createAuthUserResult ?? { ok: true, userId: FICTIONAL_TARGET_ID }
      );
    },
    async deleteAuthUser(userId) {
      deps.deletedAuthUsers.push(userId);
      return true;
    },
    async updateAuthUserPassword(userId, password) {
      deps.passwordUpdates.push({ userId, password });
      return options.updatePasswordSucceeds ?? true;
    },
    async setMustChangePassword(userId, value) {
      deps.mustChangeUpdates.push({ userId, value });
    },
    async applyAccessChange() {
      return options.accessChangeResult ?? { ok: true };
    },
    async writeAudit(event) {
      deps.auditEvents.push(event);
    },
  };
  return deps;
}

const admin = fictionalSession("administrator");

describe("createStaffAccount", () => {
  it.each(["scanner", "supervisor", "administrator"] as const)(
    "creates a %s account with a compliant one-time temporary password",
    async (role) => {
      const deps = makeDeps();
      const result = await createStaffAccount(deps, admin, {
        email: "New.Staff@Example.COM",
        displayName: "New Fictional Staff",
        role,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.role).toBe(role);
        expect(result.data.email).toBe("new.staff@example.com");
        expect(isPasswordCompliant(result.data.temporaryPassword)).toBe(true);
        // The password is returned exactly once and never stored.
        expect(JSON.stringify(deps.insertedProfiles)).not.toContain(
          result.data.temporaryPassword
        );
        expect(JSON.stringify(deps.auditEvents)).not.toContain(
          result.data.temporaryPassword
        );
      }
      expect(deps.insertedProfiles).toHaveLength(1);
      expect(deps.insertedProfiles[0].must_change_password).toBe(true);
      expect(deps.insertedProfiles[0].created_by).toBe(admin.userId);
      expect(deps.auditEvents).toHaveLength(1);
      expect(deps.auditEvents[0].action).toBe("staff_created");
    }
  );

  it("rejects a duplicate staff email before touching Auth", async () => {
    const deps = makeDeps({ existingByEmail: fictionalProfile() });
    const result = await createStaffAccount(deps, admin, {
      email: "fictional.staff@example.com",
      displayName: "Duplicate",
      role: "scanner",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
    }
    expect(deps.createdAuthUsers).toHaveLength(0);
  });

  it("maps an Auth email conflict to the same safe error", async () => {
    const deps = makeDeps({
      createAuthUserResult: { ok: false, code: "email_exists" },
    });
    const result = await createStaffAccount(deps, admin, {
      email: "fictional.staff@example.com",
      displayName: "Duplicate",
      role: "scanner",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error.error.code).toBe("staff_email_exists");
    }
  });

  it("deletes the Auth user when profile creation fails", async () => {
    const deps = makeDeps({ insertProfileFails: true });
    const result = await createStaffAccount(deps, admin, {
      email: "new.staff@example.com",
      displayName: "New Fictional Staff",
      role: "scanner",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
    }
    expect(deps.deletedAuthUsers).toEqual([FICTIONAL_TARGET_ID]);
    expect(deps.auditEvents).toHaveLength(0);
  });

  it("rejects invalid input with 422", async () => {
    const deps = makeDeps();
    const result = await createStaffAccount(deps, admin, {
      email: "not-an-email",
      displayName: "",
      role: "owner",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
    }
  });

  it.each(["scanner", "supervisor"] as const)(
    "denies %s actors",
    async (role) => {
      const deps = makeDeps();
      const result = await createStaffAccount(deps, fictionalSession(role), {
        email: "new.staff@example.com",
        displayName: "New Fictional Staff",
        role: "scanner",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(403);
      }
      expect(deps.createdAuthUsers).toHaveLength(0);
    }
  );
});

describe("changeStaffRole", () => {
  it("writes a role_changed audit event on success", async () => {
    const deps = makeDeps({ targetProfile: fictionalProfile({ role: "scanner" }) });
    const result = await changeStaffRole(deps, admin, FICTIONAL_TARGET_ID, {
      role: "supervisor",
    });
    expect(result.ok).toBe(true);
    expect(deps.auditEvents).toHaveLength(1);
    expect(deps.auditEvents[0].action).toBe("role_changed");
    expect(deps.auditEvents[0].previousValues).toEqual({ role: "scanner" });
    expect(deps.auditEvents[0].newValues).toEqual({ role: "supervisor" });
  });

  it("blocks self-demotion through the database safeguard", async () => {
    const deps = makeDeps({
      targetProfile: fictionalProfile({ role: "administrator" }),
      accessChangeResult: { ok: false, code: "self_demotion_blocked" },
    });
    const result = await changeStaffRole(deps, admin, FICTIONAL_TARGET_ID, {
      role: "scanner",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error.error.code).toBe("self_demotion_blocked");
    }
    expect(deps.auditEvents).toHaveLength(0);
  });

  it("blocks demoting the final active administrator", async () => {
    const deps = makeDeps({
      targetProfile: fictionalProfile({ role: "administrator" }),
      accessChangeResult: { ok: false, code: "final_administrator_protected" },
    });
    const result = await changeStaffRole(deps, admin, FICTIONAL_TARGET_ID, {
      role: "supervisor",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error.error.code).toBe("final_administrator_protected");
    }
  });

  it("returns 404 for an unknown staff member", async () => {
    const deps = makeDeps({ targetProfile: null });
    const result = await changeStaffRole(deps, admin, FICTIONAL_TARGET_ID, {
      role: "supervisor",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });
});

describe("setStaffActive", () => {
  it("writes a staff_deactivated audit event", async () => {
    const deps = makeDeps({ targetProfile: fictionalProfile({ is_active: true }) });
    const result = await setStaffActive(deps, admin, FICTIONAL_TARGET_ID, {
      active: false,
    });
    expect(result.ok).toBe(true);
    expect(deps.auditEvents[0].action).toBe("staff_deactivated");
  });

  it("writes a staff_activated audit event and preserves the role", async () => {
    const deps = makeDeps({
      targetProfile: fictionalProfile({ is_active: false, role: "supervisor" }),
    });
    const result = await setStaffActive(deps, admin, FICTIONAL_TARGET_ID, {
      active: true,
    });
    expect(result.ok).toBe(true);
    expect(deps.auditEvents[0].action).toBe("staff_activated");
    expect(deps.auditEvents[0].newValues).toEqual({
      is_active: true,
      role: "supervisor",
    });
  });

  it("blocks self-deactivation through the database safeguard", async () => {
    const deps = makeDeps({
      targetProfile: fictionalProfile({ role: "administrator" }),
      accessChangeResult: { ok: false, code: "self_deactivation_blocked" },
    });
    const result = await setStaffActive(deps, admin, FICTIONAL_TARGET_ID, {
      active: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error.error.code).toBe("self_deactivation_blocked");
    }
  });

  it("blocks deactivating the final active administrator", async () => {
    const deps = makeDeps({
      targetProfile: fictionalProfile({ role: "administrator" }),
      accessChangeResult: { ok: false, code: "final_administrator_protected" },
    });
    const result = await setStaffActive(deps, admin, FICTIONAL_TARGET_ID, {
      active: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error.code).toBe("final_administrator_protected");
    }
  });
});

describe("resetStaffTemporaryPassword", () => {
  it("resets to a compliant one-time password and audits without it", async () => {
    const deps = makeDeps();
    const result = await resetStaffTemporaryPassword(
      deps,
      admin,
      FICTIONAL_TARGET_ID
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isPasswordCompliant(result.data.temporaryPassword)).toBe(true);
      expect(deps.passwordUpdates).toHaveLength(1);
      expect(deps.mustChangeUpdates).toEqual([
        { userId: FICTIONAL_TARGET_ID, value: true },
      ]);
      expect(deps.auditEvents[0].action).toBe("temporary_password_reset");
      expect(JSON.stringify(deps.auditEvents)).not.toContain(
        result.data.temporaryPassword
      );
    }
  });

  it("fails without side effects when the Auth update fails", async () => {
    const deps = makeDeps({ updatePasswordSucceeds: false });
    const result = await resetStaffTemporaryPassword(
      deps,
      admin,
      FICTIONAL_TARGET_ID
    );
    expect(result.ok).toBe(false);
    expect(deps.mustChangeUpdates).toHaveLength(0);
    expect(deps.auditEvents).toHaveLength(0);
  });
});

describe("parseAccessChangeResult", () => {
  it("parses success and blocked results", () => {
    expect(parseAccessChangeResult({ ok: true })).toEqual({ ok: true });
    expect(
      parseAccessChangeResult({ ok: false, code: "staff_not_found" })
    ).toEqual({ ok: false, code: "staff_not_found" });
    expect(parseAccessChangeResult(null)).toEqual({
      ok: false,
      code: "unexpected_result",
    });
  });
});
