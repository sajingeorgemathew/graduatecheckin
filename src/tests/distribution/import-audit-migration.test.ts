/**
 * Static safety audit of the CHECKIN-09C result-import-row audit migration.
 *
 * It must be additive only, lock the new table down with RLS and revoked
 * privileges, keep rejected rows visible but unapplied, and store no credential
 * material.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

let migration = "";
let fileName = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_create_result_import_row_audit.sql")
  );
  expect(files).toHaveLength(1);
  fileName = files[0];
  migration = readFileSync(join(migrationsDir, fileName), "utf8").toLowerCase();
});

describe("result-import-row audit migration safety", () => {
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

  it("never alters an existing delivery, ticket or attendance table", () => {
    for (const table of [
      "graduation_tickets",
      "graduation_checkins",
      "graduation_registrations",
      "graduation_ticket_deliveries",
      "graduation_ticket_delivery_attempts",
    ]) {
      expect(migration, table).not.toContain(`alter table public.${table}`);
      expect(migration, table).not.toContain(`update public.${table}`);
    }
  });

  it("creates only the additive audit table", () => {
    expect(migration).toContain(
      "create table if not exists public.graduation_ticket_delivery_result_import_rows"
    );
  });

  it("keeps every disposition, including rejected", () => {
    expect(migration).toContain("'accepted'");
    expect(migration).toContain("'duplicate'");
    expect(migration).toContain("'warning'");
    expect(migration).toContain("'rejected'");
  });

  it("locks the table with RLS and revoked privileges and no policy", () => {
    expect(migration).toContain(
      "alter table public.graduation_ticket_delivery_result_import_rows"
    );
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("from anon, authenticated");
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("using (true)");
  });

  it("stores no raw token, token hash, signing secret or row signature", () => {
    expect(migration).not.toMatch(/\braw_token\b/);
    expect(migration).not.toMatch(/\bqr_token\b/);
    expect(migration).not.toMatch(/token_hash/);
    expect(migration).not.toMatch(/signing_secret/);
    expect(migration).not.toMatch(/row_signature/);
  });
});
