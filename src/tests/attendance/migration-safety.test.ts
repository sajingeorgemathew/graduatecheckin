import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * Static safety coverage for the CHECKIN-08 migration. These assertions pin
 * the additive, append-only, locked and privacy-safe design of the manual
 * arrival, correction and reversal functions and confirm every earlier
 * migration stays in place. They never touch a database.
 */

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

let migration = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_create_attendance_supervisor_workflow.sql")
  );
  expect(files).toHaveLength(1);
  migration = readFileSync(join(migrationsDir, files[0]), "utf8").toLowerCase();
});

describe("CHECKIN-08 migration safety", () => {
  it("keeps every previously deployed migration in place", () => {
    const files = readdirSync(migrationsDir);
    for (const suffix of [
      "_create_graduation_checkin_schema.sql",
      "_create_registration_import_pipeline.sql",
      "_extend_staff_authentication.sql",
      "_extend_secure_ticket_generation.sql",
      "_fix_ticket_replacement_transaction.sql",
      "_create_ticket_scan_validation_audit.sql",
      "_create_graduate_guest_checkin_workflow.sql",
    ]) {
      expect(files.some((file) => file.endsWith(suffix)), suffix).toBe(true);
    }
  });

  it("never drops, alters, updates or deletes existing objects or rows", () => {
    expect(migration).not.toContain("drop table");
    expect(migration).not.toContain("drop column");
    expect(migration).not.toContain("drop index");
    expect(migration).not.toContain("rename to");
    expect(migration).not.toContain("rename column");
    expect(migration).not.toContain("alter column");
    expect(migration).not.toContain("truncate");
    expect(migration).not.toContain("update public.graduation_checkins");
    expect(migration).not.toContain("delete from public.graduation_checkins");
  });

  it("reuses graduation_checkins and adds only entry_kind and reason", () => {
    expect(migration).not.toContain("create table public.graduation_checkins");
    expect(migration).toContain("alter table public.graduation_checkins");
    expect(migration).toContain("add column if not exists entry_kind");
    expect(migration).toContain("add column if not exists reason text");
    // No duplicate attendance delta columns.
    expect(migration).not.toContain("add column if not exists graduate_delta");
    expect(migration).not.toContain(
      "add column if not exists adult_guest_delta"
    );
    // No contact, token, ticket-code or payment columns.
    for (const forbidden of [
      "add column if not exists email",
      "add column if not exists phone",
      "add column if not exists guest",
      "add column if not exists token",
      "add column if not exists ticket_code",
      "add column if not exists payment",
    ]) {
      expect(migration, forbidden).not.toContain(forbidden);
    }
  });

  it("defines the entry-kind enum with the four classifications", () => {
    expect(migration).toContain("create type public.attendance_entry_kind");
    for (const value of [
      "'scan_arrival'",
      "'manual_arrival'",
      "'correction'",
      "'reversal'",
    ]) {
      expect(migration, value).toContain(value);
    }
  });

  it("requires a reason for non-scan entries and bounds its length", () => {
    expect(migration).toContain("graduation_checkins_reason_length");
    expect(migration).toContain("graduation_checkins_reason_required");
    expect(migration).toContain("between 5 and 500");
  });

  it("adds the entry-kind, reversal-link and double-reversal indexes", () => {
    expect(migration).toContain("graduation_checkins_entry_kind_idx");
    expect(migration).toContain("graduation_checkins_reverses_checkin_idx");
    expect(migration).toContain("graduation_checkins_one_reversal_per_row");
    expect(migration).toContain("where reverses_checkin_id is not null");
  });

  it("defines three security definer functions with fixed safe search paths", () => {
    for (const fn of [
      "public.apply_manual_graduation_arrival",
      "public.apply_attendance_correction",
      "public.reverse_graduation_checkin",
    ]) {
      expect(migration, fn).toContain(
        `create or replace function ${fn}`
      );
    }
    expect(migration.match(/security definer/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration.match(/set search_path = ''/g)?.length).toBeGreaterThanOrEqual(
      3
    );
  });

  it("revokes execution of every function from public, anon and authenticated", () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(
        migration.match(
          new RegExp(`revoke all on function [^;]+ from ${role}`, "g")
        )?.length,
        role
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("verifies supervisor or administrator inside every function", () => {
    expect(
      migration.match(/role in \('supervisor', 'administrator'\)/g)?.length
    ).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("and is_active");
    expect(migration).toContain("'unauthorized'");
  });

  it("locks the registration and recalculates totals inside the transaction", () => {
    expect(migration).toContain("from public.graduation_registrations");
    expect(
      migration.match(/for update/g)?.length
    ).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("where registration_id = v_registration.id");
    expect(migration).toContain("sum(graduate_delta)");
  });

  it("is append-only and never changes allowances, tickets or payment", () => {
    expect(
      migration.match(/insert into public.graduation_checkins/g)?.length
    ).toBeGreaterThanOrEqual(3);
    expect(migration).not.toContain("update public.graduation_registrations");
    expect(migration).not.toContain("update public.graduation_tickets");
    expect(migration).not.toContain("payment_status =");
  });

  it("blocks reversing a reversal and an already-reversed row", () => {
    expect(migration).toContain("'not_reversible'");
    expect(migration).toContain("'already_reversed'");
    expect(migration).toContain("'unsafe_reversal'");
  });
});
