/**
 * Static safety audit of the CHECKIN-10A production cutover migration.
 *
 * It must be additive only, must not touch any previously deployed object,
 * must lock the new table down with RLS and revoked privileges, and must
 * store no credential or token material.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

/** Every migration that was already deployed before CHECKIN-10A. */
const DEPLOYED_BEFORE = [
  "20260717015847_create_graduation_checkin_schema.sql",
  "20260717113948_create_registration_import_pipeline.sql",
  "20260717125045_extend_staff_authentication.sql",
  "20260717214419_extend_secure_ticket_generation.sql",
  "20260718030830_fix_ticket_replacement_transaction.sql",
  "20260718133116_create_ticket_scan_validation_audit.sql",
  "20260718152332_create_graduate_guest_checkin_workflow.sql",
  "20260718194605_create_attendance_supervisor_workflow.sql",
  "20260720171500_create_branded_ticket_document_export.sql",
  "20260721120000_create_ticket_distribution_delivery.sql",
  "20260721180000_create_result_import_row_audit.sql",
];

let migration = "";
let fileName = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_create_production_cutover_controls.sql")
  );
  // Exactly one migration for this feature. A second one would mean the
  // interrupted run created a duplicate.
  expect(files).toHaveLength(1);
  fileName = files[0];
  migration = readFileSync(join(migrationsDir, fileName), "utf8").toLowerCase();
});

describe("CHECKIN-10A production cutover migration safety", () => {
  it("adds exactly one new migration and leaves every deployed one in place", () => {
    const present = readdirSync(migrationsDir).filter((file) =>
      file.endsWith(".sql")
    );
    for (const deployed of DEPLOYED_BEFORE) {
      expect(present, `${deployed} must still exist`).toContain(deployed);
    }
    expect(present).toHaveLength(DEPLOYED_BEFORE.length + 1);
  });

  it("is timestamped after every migration deployed before it", () => {
    const mine = fileName.slice(0, 14);
    for (const deployed of DEPLOYED_BEFORE) {
      const other = deployed.slice(0, 14);
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
      "drop policy",
      "delete from",
      "truncate",
    ]) {
      expect(migration, forbidden).not.toContain(forbidden);
    }
  });

  it("never updates an existing row", () => {
    expect(migration).not.toContain("update public.");
  });

  it("never alters an existing ticket, checkin, registration or delivery table", () => {
    for (const table of [
      "graduation_tickets",
      "graduation_checkins",
      "graduation_registrations",
      "registration_guests",
      "graduation_ticket_documents",
      "graduation_ticket_deliveries",
      "graduation_ticket_delivery_attempts",
      "graduation_ticket_delivery_result_import_rows",
    ]) {
      expect(migration, table).not.toContain(`alter table public.${table}`);
    }
  });

  it("creates the external delivery table additively", () => {
    expect(migration).toContain(
      "create table if not exists public.graduation_ticket_external_deliveries"
    );
  });

  it("adds the batch purpose reason as a nullable additive column", () => {
    expect(migration).toContain(
      "alter table public.graduation_ticket_delivery_batches"
    );
    expect(migration).toContain("add column if not exists purpose_reason text");
    // A NOT NULL column would rewrite every previously prepared batch row.
    expect(migration).not.toContain("purpose_reason text not null");
  });

  it("restricts the external delivery channel to the known set", () => {
    for (const channel of [
      "'personal_email'",
      "'office_email'",
      "'printed_handout'",
      "'messaging_app'",
      "'other'",
    ]) {
      expect(migration, channel).toContain(channel);
    }
  });

  it("locks the new table with RLS and revoked privileges and no policy", () => {
    expect(migration).toContain(
      "alter table public.graduation_ticket_external_deliveries"
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
    expect(migration).not.toMatch(/service_role_key/);
  });

  it("creates no delivery attempt, so an external record is never a send", () => {
    // The whole point of the table: it must not write into the attempt log.
    expect(migration).not.toContain(
      "insert into public.graduation_ticket_delivery_attempts"
    );
    expect(migration).not.toContain("insert into public.graduation_ticket_deliveries");
  });
});
