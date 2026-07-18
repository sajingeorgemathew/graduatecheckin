import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

const NEW_TICKET_COLUMNS = [
  "token_version",
  "generation_batch_id",
  "issued_by",
  "revoked_by",
  "revocation_reason",
] as const;

const NEW_TABLES = ["ticket_generation_batches", "ticket_activity_log"] as const;

const FUNCTION_SIGNATURES = [
  "apply_ticket_generation_batch(uuid, uuid, text, text, jsonb)",
  "replace_graduation_ticket(uuid, uuid, uuid, text, text, integer, text, text)",
  "revoke_graduation_ticket(uuid, uuid, text, text)",
] as const;

let migration = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_extend_secure_ticket_generation.sql")
  );
  expect(files).toHaveLength(1);
  migration = readFileSync(join(migrationsDir, files[0]), "utf8").toLowerCase();
});

describe("secure ticket generation migration safety", () => {
  it("keeps every previously deployed migration in place", () => {
    const files = readdirSync(migrationsDir);
    for (const suffix of [
      "_create_graduation_checkin_schema.sql",
      "_create_registration_import_pipeline.sql",
      "_extend_staff_authentication.sql",
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
  });

  it("creates the batch status and activity action enums", () => {
    expect(migration).toContain(
      "create type public.ticket_generation_batch_status as enum"
    );
    for (const value of ["processing", "completed", "partial", "failed"]) {
      expect(migration).toContain(`'${value}'`);
    }
    expect(migration).toContain(
      "create type public.ticket_activity_action as enum"
    );
    for (const value of ["generated", "replaced", "revoked"]) {
      expect(migration).toContain(`'${value}'`);
    }
  });

  it("creates the batch and activity tables", () => {
    for (const table of NEW_TABLES) {
      expect(migration).toContain(`create table public.${table}`);
    }
    expect(migration).toContain("idempotency_key text not null");
    expect(migration).toContain(
      "ticket_generation_batches_idempotency_key_unique"
    );
  });

  it("adds every new graduation_tickets column additively", () => {
    for (const column of NEW_TICKET_COLUMNS) {
      expect(migration).toContain(`add column if not exists ${column}`);
    }
  });

  it("enforces the token-hash format constraint", () => {
    expect(migration).toContain("graduation_tickets_token_hash_format");
    expect(migration).toContain("^[0-9a-f]{64}$");
  });

  it("adds no raw-token column anywhere", () => {
    expect(migration).not.toMatch(
      /add column if not exists (raw_token|qr_token|token_value|ticket_token|token )/
    );
    expect(migration).not.toMatch(/raw_token\s+text/);
    expect(migration).not.toMatch(/\n\s{2}token\s+text/);
    // The bulk function actively rejects raw token fields in its input.
    expect(migration).toContain("raw token fields are never accepted");
  });

  it("preserves the one-active-ticket-per-registration uniqueness", () => {
    const schemaFile = readdirSync(migrationsDir).find((file) =>
      file.endsWith("_create_graduation_checkin_schema.sql")
    );
    expect(schemaFile).toBeDefined();
    const schema = readFileSync(
      join(migrationsDir, schemaFile ?? ""),
      "utf8"
    ).toLowerCase();
    expect(schema).toContain(
      "graduation_tickets_one_active_per_registration"
    );
    expect(migration).not.toContain(
      "graduation_tickets_one_active_per_registration"
    );
  });

  it("locks the new tables down with RLS and revoked privileges", () => {
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

  it("defines all three functions as security definer with safe search paths", () => {
    const definerCount = migration.split("security definer").length - 1;
    expect(definerCount).toBeGreaterThanOrEqual(3);
    const searchPathCount = migration.split("set search_path = ''").length - 1;
    expect(searchPathCount).toBeGreaterThanOrEqual(3);
  });

  it("revokes public, anonymous and authenticated function execution", () => {
    for (const signature of FUNCTION_SIGNATURES) {
      for (const roleName of ["public", "anon", "authenticated"]) {
        expect(migration).toContain(
          `revoke all on function public.${signature} from ${roleName}`
        );
      }
    }
  });

  it("verifies an active administrator inside every function", () => {
    const adminChecks =
      migration.split("role = 'administrator'").length - 1;
    expect(adminChecks).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("from public.staff_profiles");
  });

  it("locks rows for concurrency safety and remains idempotent", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("idempotency_key = p_idempotency_key");
    expect(migration).toContain("'duplicate', true");
  });

  it("documents that raw tokens are never stored", () => {
    expect(migration).toContain("never stored");
  });
});
