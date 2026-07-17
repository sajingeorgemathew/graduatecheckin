import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

const NEW_STAFF_COLUMNS = [
  "email_snapshot",
  "must_change_password",
  "last_login_at",
  "created_by",
  "updated_by",
] as const;

const AUDIT_ACTIONS = [
  "staff_created",
  "role_changed",
  "staff_activated",
  "staff_deactivated",
  "temporary_password_reset",
  "password_changed",
  "login_blocked",
] as const;

let migration = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_extend_staff_authentication.sql")
  );
  expect(files).toHaveLength(1);
  migration = readFileSync(join(migrationsDir, files[0]), "utf8").toLowerCase();
});

describe("staff authentication migration safety", () => {
  it("keeps the previously deployed migrations in place", () => {
    const files = readdirSync(migrationsDir);
    expect(
      files.some((file) =>
        file.endsWith("_create_graduation_checkin_schema.sql")
      )
    ).toBe(true);
    expect(
      files.some((file) =>
        file.endsWith("_create_registration_import_pipeline.sql")
      )
    ).toBe(true);
  });

  it("never drops or rewrites existing tables or columns", () => {
    expect(migration).not.toContain("drop table");
    expect(migration).not.toContain("drop column");
    expect(migration).not.toContain("delete from");
    expect(migration).not.toContain("alter table public.graduation_");
    expect(migration).not.toContain("alter table public.registration_");
  });

  it("adds every new staff_profiles column additively", () => {
    expect(migration).toContain("alter table public.staff_profiles");
    for (const column of NEW_STAFF_COLUMNS) {
      expect(migration).toContain(`add column if not exists ${column}`);
    }
  });

  it("indexes lowercase email and active status with role", () => {
    expect(migration).toContain("staff_profiles_email_snapshot_idx");
    expect(migration).toContain("lower(email_snapshot)");
    expect(migration).toContain("staff_profiles_active_role_idx");
    expect(migration).toContain("(is_active, role)");
  });

  it("creates the audit table with every allowed action", () => {
    expect(migration).toContain("create table public.staff_access_audit_log");
    expect(migration).toContain(
      "create type public.staff_access_action as enum"
    );
    for (const action of AUDIT_ACTIONS) {
      expect(migration).toContain(`'${action}'`);
    }
  });

  it("indexes actor, target, action and created time", () => {
    expect(migration).toContain("staff_access_audit_log_actor_idx");
    expect(migration).toContain("staff_access_audit_log_target_idx");
    expect(migration).toContain("staff_access_audit_log_action_idx");
    expect(migration).toContain("staff_access_audit_log_created_at_idx");
  });

  it("locks the audit table down with RLS and revoked privileges", () => {
    expect(migration).toContain(
      "alter table public.staff_access_audit_log enable row level security"
    );
    expect(migration).toContain(
      "revoke all on table public.staff_access_audit_log from anon, authenticated"
    );
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("using (true)");
  });

  it("stores no password or token columns in staff tables", () => {
    expect(migration).not.toMatch(/password\s+text/);
    expect(migration).not.toMatch(/token\s+text/);
    expect(migration).not.toContain("password_hash");
    expect(migration).not.toContain("bytea");
  });

  it("defines the concurrency-safe final-administrator safeguard", () => {
    expect(migration).toContain(
      "create or replace function public.apply_staff_access_change("
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    // Row locks make concurrent removal of the final administrator impossible.
    expect(migration).toContain("for update");
    expect(migration).toContain("final_administrator_protected");
    expect(migration).toContain("self_deactivation_blocked");
    expect(migration).toContain("self_demotion_blocked");
  });

  it("revokes the safeguard function from public roles", () => {
    for (const roleName of ["public", "anon", "authenticated"]) {
      expect(migration).toContain(
        "revoke all on function public.apply_staff_access_change(uuid, uuid, public.staff_role, boolean) from " +
          roleName
      );
    }
  });

  it("documents that credentials are never stored", () => {
    expect(migration).toContain("never stored");
  });
});
