import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * Static safety coverage for the CHECKIN-07 migration. These assertions
 * pin the append-only, registration-level, locked and privacy-safe design
 * of the arrival-confirmation function and confirm every earlier migration
 * stays in place. They never touch a database.
 */

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

let migration = "";
let body = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_create_graduate_guest_checkin_workflow.sql")
  );
  expect(files).toHaveLength(1);
  migration = readFileSync(join(migrationsDir, files[0]), "utf8").toLowerCase();
  body = migration.slice(
    migration.indexOf("create or replace function public.apply_graduation_checkin")
  );
});

describe("CHECKIN-07 migration safety", () => {
  it("keeps every previously deployed migration in place", () => {
    const files = readdirSync(migrationsDir);
    for (const suffix of [
      "_create_graduation_checkin_schema.sql",
      "_create_registration_import_pipeline.sql",
      "_extend_staff_authentication.sql",
      "_extend_secure_ticket_generation.sql",
      "_fix_ticket_replacement_transaction.sql",
      "_create_ticket_scan_validation_audit.sql",
    ]) {
      expect(files.some((file) => file.endsWith(suffix)), suffix).toBe(true);
    }
  });

  it("never drops, alters or deletes existing objects", () => {
    expect(migration).not.toContain("drop table");
    expect(migration).not.toContain("drop column");
    expect(migration).not.toContain("drop index");
    expect(migration).not.toContain("rename to");
    expect(migration).not.toContain("rename column");
    expect(migration).not.toContain("delete from");
    expect(migration).not.toContain("truncate");
    // The only alter statements add nullable metadata columns.
    expect(migration).not.toContain("alter column");
  });

  it("reuses graduation_checkins and never recreates it", () => {
    expect(migration).not.toContain("create table public.graduation_checkins");
    expect(migration).toContain("alter table public.graduation_checkins");
  });

  it("adds only nullable metadata columns and no duplicate delta columns", () => {
    expect(migration).toContain("add column if not exists request_id uuid");
    expect(migration).toContain(
      "add column if not exists validation_attempt_id uuid"
    );
    expect(migration).toContain("add column if not exists recorded_by uuid");
    // None of the metadata columns are declared not null.
    expect(migration).not.toMatch(/add column if not exists [a-z_]+ uuid[^;]*not null/);
    // The existing delta columns are never re-declared.
    expect(migration).not.toContain("add column if not exists graduate_delta");
    expect(migration).not.toContain(
      "add column if not exists adult_guest_delta"
    );
  });

  it("references ticket_scan_attempts and auth.users for the new columns", () => {
    expect(migration).toContain("references public.ticket_scan_attempts");
    expect(migration).toContain("references auth.users");
  });

  it("adds the validation-attempt and actor-request unique indexes", () => {
    expect(migration).toContain(
      "graduation_checkins_validation_attempt_unique"
    );
    expect(migration).toContain(
      "graduation_checkins_recorded_by_request_unique"
    );
    expect(migration).toContain("where validation_attempt_id is not null");
    expect(migration).toContain(
      "where recorded_by is not null and request_id is not null"
    );
  });

  it("adds the registration-created, and recorded-by indexes", () => {
    expect(migration).toContain(
      "graduation_checkins_registration_created_idx"
    );
    expect(migration).toContain("graduation_checkins_recorded_by_idx");
  });

  it("defines a security definer function with a fixed safe search_path", () => {
    expect(migration).toContain(
      "create or replace function public.apply_graduation_checkin"
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
  });

  it("revokes execution from public, anon and authenticated", () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(migration).toContain(
        "revoke all on function public.apply_graduation_checkin" +
          `(uuid, uuid, uuid, uuid, integer, integer, integer, integer) from ${role}`
      );
    }
  });

  it("verifies active scanner-level staff before any write", () => {
    const staffCheck = body.indexOf("role in ('scanner', 'supervisor', 'administrator')");
    const insert = body.indexOf("insert into public.graduation_checkins");
    expect(staffCheck).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(staffCheck).toBeLessThan(insert);
    expect(body).toContain("and is_active");
    expect(body).toContain("'unauthorized'");
  });

  it("locks the validation attempt, event, ticket and registration", () => {
    const locks = body.split("for update").length - 1;
    expect(locks).toBeGreaterThanOrEqual(4);
    expect(body).toContain("from public.ticket_scan_attempts");
    expect(body).toContain("from public.graduation_events");
    expect(body).toContain("from public.graduation_tickets");
    expect(body).toContain("from public.graduation_registrations");
  });

  it("enforces the 15 minute validation lifetime", () => {
    expect(body).toContain("interval '15 minutes'");
    expect(body).toContain("'validation_expired'");
  });

  it("blocks already-checked-in and non-eligible validation results", () => {
    expect(body).toContain("v_attempt.result = 'already_checked_in'");
    expect(body).toContain(
      "v_attempt.result not in ('valid', 'partially_checked_in')"
    );
  });

  it("consumes the validation attempt only once", () => {
    expect(body).toContain(
      "where validation_attempt_id = p_validation_attempt_id"
    );
    expect(body).toContain("'validation_used'");
  });

  it("recalculates registration-level totals inside the transaction", () => {
    // Totals are summed from graduation_checkins by registration, not from
    // one ticket.
    expect(body).toContain("sum(graduate_delta)");
    expect(body).toContain("sum(adult_guest_delta)");
    expect(body).toContain("where registration_id = v_registration.id");
    expect(body).not.toContain("where ticket_id = v_ticket.id");
  });

  it("rechecks ticket, registration and event status at confirmation", () => {
    expect(body).toContain("v_ticket.status <> 'active'");
    expect(body).toContain("v_registration.registration_status <> 'eligible'");
    expect(body).toContain("v_event.status = 'closed'");
    expect(body).toContain("v_event.status = 'archived'");
  });

  it("prevents a second full admission and enforces allowances", () => {
    expect(body).toContain("'already_complete'");
    expect(body).toContain("'allowance_exceeded'");
    expect(body).toContain("'conflict'");
  });

  it("inserts one append-only positive admission and never updates or deletes", () => {
    expect(body).toContain("insert into public.graduation_checkins");
    expect(body).toContain("'admission'");
    // Positive arriving values are inserted directly.
    expect(body).toContain("p_graduate_arriving,");
    expect(body).not.toContain("update public.graduation_checkins");
    expect(body).not.toContain("delete from public.graduation_checkins");
  });

  it("does not change registration allowances, ticket or payment status", () => {
    expect(body).not.toContain("update public.graduation_registrations");
    expect(body).not.toContain("update public.graduation_tickets");
    expect(body).not.toContain("payment_status =");
  });

  it("rolls a concurrent conflict back into a structured result", () => {
    expect(body).toContain("when unique_violation then");
    expect(body).toContain("'conflict'");
  });

  it("stores and returns no raw token, hash, payload or contact column", () => {
    for (const forbidden of [
      "raw_token",
      "token_hash",
      "qr_payload",
      "add column if not exists email",
      "add column if not exists phone",
      "add column if not exists guest",
    ]) {
      expect(migration, forbidden).not.toContain(forbidden);
    }
  });
});
