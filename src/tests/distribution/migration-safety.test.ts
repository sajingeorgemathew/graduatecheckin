/**
 * Static safety audit of the CHECKIN-09B distribution migration.
 *
 * It must be additive only, lock every table down with RLS and revoked
 * privileges, harden its security-definer functions, keep the attempt log
 * append-only and never store credential material.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

const NEW_TABLES = [
  "graduation_ticket_delivery_batches",
  "graduation_ticket_deliveries",
  "graduation_ticket_delivery_attempts",
  "graduation_ticket_delivery_result_imports",
] as const;

let migration = "";
let fileName = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_create_ticket_distribution_delivery.sql")
  );
  expect(files).toHaveLength(1);
  fileName = files[0];
  migration = readFileSync(join(migrationsDir, fileName), "utf8").toLowerCase();
});

describe("distribution migration safety", () => {
  it("is timestamped after every previously deployed migration", () => {
    const others = readdirSync(migrationsDir)
      .filter((file) => file !== fileName && file.endsWith(".sql"))
      .map((file) => file.slice(0, 14));
    const mine = fileName.slice(0, 14);
    for (const other of others) {
      expect(mine > other, `${mine} must sort after ${other}`).toBe(true);
    }
  });

  it("never drops, deletes or truncates anything", () => {
    for (const forbidden of [
      "drop table",
      "drop column",
      "drop index",
      "drop constraint",
      "drop function",
      "drop trigger",
      "drop type",
      "delete from",
      "truncate",
    ]) {
      expect(migration, forbidden).not.toContain(forbidden);
    }
  });

  it("never alters an existing ticket, attendance, registration or document table", () => {
    for (const table of [
      "graduation_tickets",
      "graduation_checkins",
      "graduation_registrations",
      "registration_guests",
      "graduation_ticket_documents",
    ]) {
      expect(migration, table).not.toContain(`alter table public.${table} add`);
      expect(migration, table).not.toContain(`update public.${table}`);
    }
  });

  it("creates every new table", () => {
    for (const table of NEW_TABLES) {
      expect(migration).toContain(`create table if not exists public.${table}`);
    }
  });

  it("has no delivered status (send success is not inbox delivery)", () => {
    expect(migration).toContain("'prepared'");
    expect(migration).toContain("'sent'");
    expect(migration).not.toContain("'delivered'");
  });

  it("enforces unique delivery and attempt references", () => {
    expect(migration).toContain("graduation_ticket_deliveries_reference_unique");
    expect(migration).toContain(
      "graduation_ticket_delivery_attempts_reference_unique"
    );
  });

  it("keeps the attempt log append-only via a guard trigger", () => {
    expect(migration).toContain("guard_ticket_delivery_attempt_append_only");
    expect(migration).toContain("append-only");
    expect(migration).toContain("before update or delete on");
  });

  it("caps a delivery batch at 50 in the database", () => {
    expect(migration).toContain("prepared_count <= 50");
  });

  it("constrains checksums and signatures to their formats", () => {
    expect(migration).toContain("^[0-9a-f]{64}$");
    expect(migration).toContain("^[a-z0-9-]{8,60}$");
  });

  it("defines security definer functions with a hardened search path", () => {
    const definerCount = migration.split("security definer").length - 1;
    expect(definerCount).toBeGreaterThanOrEqual(2);
    const searchPathCount = migration.split("set search_path = ''").length - 1;
    expect(searchPathCount).toBeGreaterThanOrEqual(3);
  });

  it("verifies an active administrator inside the security definer functions", () => {
    const adminChecks = migration.split("role = 'administrator'").length - 1;
    expect(adminChecks).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("from public.staff_profiles");
  });

  it("revokes public, anon and authenticated execution of both functions", () => {
    expect(migration).toContain(
      "revoke all on function public.record_ticket_delivery_attempt"
    );
    expect(migration).toContain(
      "revoke all on function public.cancel_ticket_delivery_batch"
    );
    for (const roleName of ["public", "anon", "authenticated"]) {
      expect(migration).toContain(`from ${roleName};`);
    }
  });

  it("locks every new table with RLS and revoked privileges", () => {
    for (const table of NEW_TABLES) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`
      );
    }
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("using (true)");
    // Scanner and supervisor are authenticated roles; revoking authenticated
    // denies them along with anon.
    expect(migration).toContain("from anon, authenticated");
  });

  it("records the attempt idempotency and lock behaviour", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("duplicate");
  });

  it("stores no raw token, token hash or signing secret column", () => {
    expect(migration).not.toMatch(/\braw_token\b/);
    expect(migration).not.toMatch(/\bqr_token\b/);
    expect(migration).not.toMatch(/token_hash\s+text/);
    expect(migration).not.toMatch(/signing_secret/);
  });
});
