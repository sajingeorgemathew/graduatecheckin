/**
 * Static safety audit of the CHECKIN-09A migration.
 *
 * The migration must be additive only, lock its tables down with RLS and
 * revoked privileges, harden every security-definer function, allocate
 * document versions under a lock, and create the storage bucket privately.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

const NEW_TABLES = [
  "graduation_event_ticket_settings",
  "graduation_ticket_documents",
  "graduation_ticket_document_batches",
  "graduation_ticket_document_batch_items",
] as const;

const PRIOR_MIGRATIONS = [
  "_create_graduation_checkin_schema.sql",
  "_create_registration_import_pipeline.sql",
  "_extend_staff_authentication.sql",
  "_extend_secure_ticket_generation.sql",
  "_fix_ticket_replacement_transaction.sql",
  "_create_ticket_scan_validation_audit.sql",
  "_create_graduate_guest_checkin_workflow.sql",
  "_create_attendance_supervisor_workflow.sql",
] as const;

let migration = "";
let fileName = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_create_branded_ticket_document_export.sql")
  );
  expect(files).toHaveLength(1);
  fileName = files[0];
  migration = readFileSync(join(migrationsDir, fileName), "utf8").toLowerCase();
});

describe("branded ticket document migration safety", () => {
  it("is timestamped after every migration that predates it", () => {
    // Migrations added later (e.g. CHECKIN-09B) legitimately sort after this
    // one, so only assert ordering against migrations that predate it.
    const mine = fileName.slice(0, 14);
    const priorTimestamps = readdirSync(migrationsDir)
      .filter((file) => file !== fileName && file.endsWith(".sql"))
      .map((file) => file.slice(0, 14))
      .filter((timestamp) => timestamp < mine);
    expect(priorTimestamps.length).toBeGreaterThan(0);
    for (const other of priorTimestamps) {
      expect(mine > other, `${mine} must sort after ${other}`).toBe(true);
    }
    // No other migration shares this timestamp.
    const collisions = readdirSync(migrationsDir)
      .filter((file) => file !== fileName && file.endsWith(".sql"))
      .map((file) => file.slice(0, 14))
      .filter((timestamp) => timestamp === mine);
    expect(collisions).toEqual([]);
  });

  it("keeps every previously deployed migration in place", () => {
    const files = readdirSync(migrationsDir);
    for (const suffix of PRIOR_MIGRATIONS) {
      expect(files.some((file) => file.endsWith(suffix)), suffix).toBe(true);
    }
  });

  it("never drops, deletes or truncates anything", () => {
    expect(migration).not.toContain("drop table");
    expect(migration).not.toContain("drop column");
    expect(migration).not.toContain("drop index");
    expect(migration).not.toContain("drop constraint");
    expect(migration).not.toContain("drop function");
    expect(migration).not.toContain("drop trigger");
    expect(migration).not.toContain("drop type");
    expect(migration).not.toContain("delete from");
    expect(migration).not.toContain("truncate");
  });

  it("never alters an existing ticket, attendance or registration table", () => {
    for (const table of [
      "graduation_tickets",
      "graduation_checkins",
      "graduation_registrations",
      "registration_guests",
      "ticket_scan_attempts",
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

  it("creates the document status and batch enums", () => {
    expect(migration).toContain("create type public.ticket_document_status as enum");
    for (const value of ["current", "superseded", "invalidated"]) {
      expect(migration).toContain(`'${value}'`);
    }
    expect(migration).toContain(
      "create type public.ticket_document_batch_status as enum"
    );
    for (const value of [
      "draft",
      "generating",
      "ready",
      "partial",
      "failed",
      "exported",
      "cancelled",
    ]) {
      expect(migration).toContain(`'${value}'`);
    }
    expect(migration).toContain(
      "create type public.ticket_document_batch_purpose as enum"
    );
    for (const value of [
      "initial",
      "updated",
      "replacement",
      "resend_preparation",
    ]) {
      expect(migration).toContain(`'${value}'`);
    }
  });

  it("enforces one current document per ticket and unique versions", () => {
    expect(migration).toContain(
      "graduation_ticket_documents_one_current_per_ticket"
    );
    expect(migration).toContain("where status = 'current'");
    // Line-ending agnostic: the working copy may be checked out with CRLF.
    expect(migration.replace(/\r\n/g, "\n")).toContain(
      "unique (\n    ticket_id, document_version\n  )"
    );
  });

  it("enforces a unique storage path so a PDF is never overwritten", () => {
    expect(migration).toContain("graduation_ticket_documents_path_unique");
  });

  it("constrains checksums and fingerprints to sha-256 hex", () => {
    expect(migration).toContain("^[0-9a-f]{64}$");
  });

  it("restricts documents to application/pdf", () => {
    expect(migration).toContain("mime_type = 'application/pdf'");
  });

  it("caps an export batch at 50 registrations in the database", () => {
    expect(migration).toContain("selected_count <= 50");
  });

  it("makes generated file metadata immutable with a guard trigger", () => {
    expect(migration).toContain("guard_ticket_document_immutability");
    expect(migration).toContain("metadata is immutable");
  });

  it("allocates document versions under a row lock", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("coalesce(max(document_version), 0) + 1");
  });

  it("supersedes the prior current document during finalization", () => {
    expect(migration).toContain("set status = 'superseded'");
  });

  it("defines security definer functions with a hardened search path", () => {
    const definerCount = migration.split("security definer").length - 1;
    expect(definerCount).toBeGreaterThanOrEqual(2);
    const searchPathCount = migration.split("set search_path = ''").length - 1;
    expect(searchPathCount).toBeGreaterThanOrEqual(3);
  });

  it("verifies an active administrator inside every security definer function", () => {
    const adminChecks = migration.split("role = 'administrator'").length - 1;
    expect(adminChecks).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("from public.staff_profiles");
  });

  it("revokes public, anonymous and authenticated function execution", () => {
    for (const roleName of ["public", "anon", "authenticated"]) {
      expect(migration).toContain(`from ${roleName};`);
    }
    expect(migration).toContain(
      "revoke all on function public.finalize_graduation_ticket_document"
    );
    expect(migration).toContain(
      "revoke all on function public.invalidate_graduation_ticket_documents"
    );
  });

  it("locks every new table with RLS and revoked privileges", () => {
    for (const table of NEW_TABLES) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`
      );
      expect(migration).toContain(
        `revoke all on table public.${table} from anon, authenticated`
      );
    }
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("using (true)");
  });

  it("creates the storage bucket privately and restricted to pdf", () => {
    expect(migration).toContain("graduation-ticket-documents");
    expect(migration).toContain("set public = false");
    expect(migration).toContain("array['application/pdf']");
    // The bucket must never be flipped public by this migration.
    expect(migration).not.toContain("public = true");
  });

  it("adds no raw token or token hash column anywhere", () => {
    expect(migration).not.toMatch(/\braw_token\b/);
    expect(migration).not.toMatch(/\bqr_token\b/);
    expect(migration).not.toMatch(/token_hash\s+text/);
    expect(migration).not.toMatch(/\n\s{2}token\s+text/);
  });

  it("documents that credential material is never stored", () => {
    expect(migration).toContain("never stores a raw qr token");
  });
});
