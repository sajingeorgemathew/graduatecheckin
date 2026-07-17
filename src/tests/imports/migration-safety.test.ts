import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

const IMPORT_TABLES = [
  "registration_imports",
  "registration_import_rows",
] as const;

let migration = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_create_registration_import_pipeline.sql")
  );
  expect(files).toHaveLength(1);
  migration = readFileSync(join(migrationsDir, files[0]), "utf8").toLowerCase();
});

describe("import migration safety", () => {
  it("does not modify the applied CHECKIN-02 migration", () => {
    const files = readdirSync(migrationsDir);
    expect(
      files.some((file) =>
        file.endsWith("_create_graduation_checkin_schema.sql")
      )
    ).toBe(true);
    // The import migration never drops or alters the original tables.
    expect(migration).not.toContain("drop table");
    expect(migration).not.toContain("alter table public.graduation_events");
    expect(migration).not.toContain(
      "alter table public.graduation_registrations"
    );
  });

  it("creates both import tables", () => {
    for (const table of IMPORT_TABLES) {
      expect(migration).toContain(`create table public.${table}`);
    }
  });

  it("creates the import status and row result enums", () => {
    expect(migration).toContain(
      "create type public.registration_import_status as enum"
    );
    expect(migration).toContain(
      "create type public.registration_import_row_result as enum"
    );
  });

  it("enables row level security on both import tables", () => {
    for (const table of IMPORT_TABLES) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`
      );
    }
  });

  it("revokes anon and authenticated privileges on both import tables", () => {
    for (const table of IMPORT_TABLES) {
      expect(migration).toContain(
        `revoke all on table public.${table} from anon, authenticated`
      );
    }
  });

  it("creates no unrestricted policies", () => {
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("using (true)");
  });

  it("stores only file metadata, never workbook contents", () => {
    expect(migration).toContain("original_filename text not null");
    expect(migration).toContain("file_sha256 text not null");
    expect(migration).toContain("file_size_bytes bigint not null");
    expect(migration).not.toContain("file_contents");
    expect(migration).not.toContain("bytea");
  });

  it("requires non-negative counts", () => {
    expect(migration).toContain("registration_imports_counts_not_negative");
    expect(migration).toContain("total_rows >= 0");
  });

  it("enforces one applied import per file hash and event", () => {
    expect(migration).toContain(
      "create unique index registration_imports_applied_file_unique"
    );
    expect(migration).toContain("(event_id, file_sha256)");
  });

  it("enforces unique row numbers per import with cascade delete", () => {
    expect(migration).toContain("registration_import_rows_row_unique");
    expect(migration).toContain(
      "references public.registration_imports (id) on delete cascade"
    );
  });

  it("validates the json issue arrays", () => {
    expect(migration).toContain("jsonb_typeof(validation_errors) = 'array'");
    expect(migration).toContain("jsonb_typeof(validation_warnings) = 'array'");
  });

  it("defines the apply function as security definer with fixed search path", () => {
    expect(migration).toContain(
      "create or replace function public.apply_registration_import(p_import_id uuid)"
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
  });

  it("revokes function execution from public roles", () => {
    expect(migration).toContain(
      "revoke all on function public.apply_registration_import(uuid) from public"
    );
    expect(migration).toContain(
      "revoke all on function public.apply_registration_import(uuid) from anon"
    );
  });

  it("documents the safety guarantees", () => {
    expect(migration).toContain("never stored");
    expect(migration).toContain("never trigger automatic deletion");
    expect(migration).toContain("preserves existing registration ids");
    expect(migration).toContain("checkin-04");
  });

  it("uses the approved child_5_10 wording, never child_4_10", () => {
    expect(migration).not.toContain("child_4_10");
    expect(migration).not.toContain("children_4_10");
  });
});
