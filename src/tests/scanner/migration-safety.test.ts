import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

const REQUIRED_INDEXES = [
  "ticket_scan_attempts_staff_idx",
  "ticket_scan_attempts_event_idx",
  "ticket_scan_attempts_ticket_idx",
  "ticket_scan_attempts_registration_idx",
  "ticket_scan_attempts_result_idx",
  "ticket_scan_attempts_created_at_idx",
] as const;

const RESULT_VALUES = [
  "valid",
  "partially_checked_in",
  "already_checked_in",
  "invalid",
  "revoked",
  "replaced",
  "pending",
  "wrong_event",
  "registration_blocked",
  "rate_limited",
  "error",
] as const;

let migration = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_create_ticket_scan_validation_audit.sql")
  );
  expect(files).toHaveLength(1);
  migration = readFileSync(join(migrationsDir, files[0]), "utf8").toLowerCase();
});

describe("ticket scan validation audit migration safety", () => {
  it("keeps every previously deployed migration in place", () => {
    const files = readdirSync(migrationsDir);
    for (const suffix of [
      "_create_graduation_checkin_schema.sql",
      "_create_registration_import_pipeline.sql",
      "_extend_staff_authentication.sql",
      "_extend_secure_ticket_generation.sql",
      "_fix_ticket_replacement_transaction.sql",
    ]) {
      expect(files.some((file) => file.endsWith(suffix)), suffix).toBe(true);
    }
  });

  it("never drops or deletes existing objects", () => {
    expect(migration).not.toContain("drop table");
    expect(migration).not.toContain("drop column");
    expect(migration).not.toContain("drop index");
    expect(migration).not.toContain("drop constraint");
    expect(migration).not.toContain("delete from");
    expect(migration).not.toContain("truncate");
    expect(migration).not.toContain("alter column");
  });

  it("creates the scan method enum", () => {
    expect(migration).toContain(
      "create type public.ticket_scan_method as enum"
    );
    expect(migration).toContain("'qr'");
    expect(migration).toContain("'manual_code'");
  });

  it("creates the validation result enum with all values", () => {
    expect(migration).toContain(
      "create type public.ticket_validation_result as enum"
    );
    for (const value of RESULT_VALUES) {
      expect(migration).toContain(`'${value}'`);
    }
  });

  it("creates the scan-attempt table with required references", () => {
    expect(migration).toContain("create table public.ticket_scan_attempts");
    expect(migration).toContain("references public.graduation_events");
    expect(migration).toContain("references public.graduation_tickets");
    expect(migration).toContain("references public.graduation_registrations");
    expect(migration).toContain("references auth.users");
    expect(migration).toContain("method public.ticket_scan_method not null");
    expect(migration).toContain(
      "result public.ticket_validation_result not null"
    );
    expect(migration).toContain("request_id uuid not null");
  });

  it("enforces the per-staff request id uniqueness", () => {
    expect(migration).toContain("ticket_scan_attempts_request_id_unique");
    const uniqueSection = migration.slice(
      migration.indexOf("ticket_scan_attempts_request_id_unique")
    );
    expect(uniqueSection).toContain("staff_user_id");
    expect(uniqueSection).toContain("request_id");
  });

  it("keeps attendance snapshots non-negative", () => {
    for (const column of [
      "graduate_arrived_snapshot",
      "adult_guests_arrived_snapshot",
      "children_0_4_arrived_snapshot",
      "children_5_10_arrived_snapshot",
    ]) {
      expect(migration).toContain(`${column} >= 0`);
    }
  });

  it("adds every required index", () => {
    for (const index of REQUIRED_INDEXES) {
      expect(migration).toContain(`create index ${index}`);
    }
  });

  it("locks the table down with RLS and revoked privileges", () => {
    expect(migration).toContain(
      "alter table public.ticket_scan_attempts enable row level security"
    );
    expect(migration).toContain(
      "revoke all on table public.ticket_scan_attempts from anon, authenticated"
    );
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("using (true)");
  });

  it("stores no payload, token, hash, code, name or contact columns", () => {
    // Column definitions are two-space indented lines inside the table.
    const forbiddenColumns = [
      "payload",
      "raw_token",
      "token_hash",
      "ticket_code",
      "graduate_name",
      "email",
      "phone",
      "guest_name",
      "payment",
    ];
    for (const column of forbiddenColumns) {
      expect(migration, column).not.toMatch(
        new RegExp(`\\n  ${column}[a-z_]* `)
      );
    }
  });

  it("documents that scan attempts are not admission records", () => {
    expect(migration).toContain("comment on table public.ticket_scan_attempts");
    expect(migration).toContain("does not represent admission");
    expect(migration).toContain("retention");
  });
});
