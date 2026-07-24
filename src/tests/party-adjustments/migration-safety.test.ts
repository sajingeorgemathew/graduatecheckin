import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * Static safety coverage for the HOTFIX-PARTY-01 migration.
 *
 * These assertions pin the additive, append-only, locked, concurrency-safe
 * and ticket-preserving design of the party-adjustment migration and confirm
 * every earlier deployed migration stays in place. They never touch a
 * database.
 */

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

const MIGRATION_SUFFIX = "_create_party_adjustment_controls.sql";

const PRIOR_MIGRATIONS = [
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
  "20260722090000_create_production_cutover_controls.sql",
  "20260723120000_create_manual_production_workflow.sql",
  "20260724020000_fix_production_import_payment_status_enum.sql",
];

let migrationFileName = "";
let migration = "";
/** The migration with SQL comments stripped, so a comment word never trips a
 * destructive-operation scan. */
let code = "";
let dense = "";
let functionBody = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith(MIGRATION_SUFFIX)
  );
  expect(files).toHaveLength(1);
  migrationFileName = files[0];
  migration = readFileSync(
    join(migrationsDir, migrationFileName),
    "utf8"
  ).toLowerCase();
  code = migration.replace(/--[^\n]*/g, "");
  dense = migration.replace(/\s+/g, " ");
  functionBody = migration.slice(
    migration.indexOf(
      "create or replace function public.update_graduation_registration_party"
    )
  );
});

describe("HOTFIX-PARTY-01 migration placement", () => {
  it("adds one additive migration after every current migration", () => {
    const all = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    // The new file must be the latest by timestamp, so it never rewrites an
    // earlier deployed migration.
    expect(all[all.length - 1]).toBe(migrationFileName);
    expect(migrationFileName.startsWith("20260724090000")).toBe(true);
  });

  it("leaves every previously deployed migration in place", () => {
    const files = readdirSync(migrationsDir);
    for (const name of PRIOR_MIGRATIONS) {
      expect(files.includes(name), name).toBe(true);
    }
  });
});

describe("audit table", () => {
  it("creates the append-only audit table", () => {
    expect(migration).toContain(
      "create table if not exists public.graduation_party_adjustments"
    );
  });

  it("records the full before and after party, reason, note, actor and key", () => {
    for (const column of [
      "event_id uuid not null",
      "registration_id uuid not null",
      "ticket_id uuid",
      "idempotency_key text not null",
      "reason text not null",
      "payment_note text",
      "before_party jsonb not null",
      "after_party jsonb not null",
      "changed_by uuid",
      "changed_at timestamptz not null default now()",
    ]) {
      expect(dense, column).toContain(column);
    }
  });

  it("is append-only: a trigger blocks update and delete", () => {
    expect(dense).toContain(
      "before update or delete on public.graduation_party_adjustments"
    );
    expect(migration).toContain("is append-only");
    expect(migration).toContain(
      "create or replace function public.guard_party_adjustment_append_only"
    );
  });

  it("makes the idempotency key unique and indexes registration, event and time", () => {
    expect(dense).toContain(
      "unique ( idempotency_key )".replace(/\s+/g, " ")
    );
    expect(migration).toContain(
      "graduation_party_adjustments_registration_idx"
    );
    expect(migration).toContain("graduation_party_adjustments_event_idx");
    expect(migration).toContain(
      "graduation_party_adjustments_changed_at_idx"
    );
  });

  it("enables RLS and revokes public, anon and authenticated access", () => {
    expect(migration).toContain(
      "alter table public.graduation_party_adjustments enable row level security"
    );
    expect(dense).toContain(
      "revoke all on table public.graduation_party_adjustments from public, anon, authenticated"
    );
  });
});

describe("update_graduation_registration_party RPC", () => {
  it("is SECURITY DEFINER with an empty search_path", () => {
    expect(functionBody).toContain("security definer");
    expect(functionBody).toContain("set search_path = ''");
  });

  it("verifies an active administrator using the staff authorization pattern", () => {
    expect(functionBody).toContain("from public.staff_profiles");
    expect(functionBody).toContain("role = 'administrator'");
    expect(functionBody).toContain("and is_active");
    expect(functionBody).toContain("'not_authorized'");
  });

  it("locks exactly one registration with FOR UPDATE", () => {
    expect(functionBody).toContain(
      "from public.graduation_registrations"
    );
    expect(functionBody).toContain("where id = p_registration_id");
    expect(functionBody).toContain("for update");
  });

  it("rejects a closed or archived event", () => {
    expect(functionBody).toContain("'event_not_open'");
    expect(functionBody).toContain("'closed'");
    expect(functionBody).toContain("'archived'");
  });

  it("uses optimistic concurrency on the registration updated_at", () => {
    expect(functionBody).toContain("p_expected_updated_at");
    expect(functionBody).toContain(
      "v_registration.updated_at is distinct from p_expected_updated_at"
    );
    expect(functionBody).toContain("'stale_registration'");
  });

  it("rejects null or negative counts", () => {
    expect(functionBody).toContain("p_adult_guest_count < 0");
    expect(functionBody).toContain("p_children_0_4 < 0");
    expect(functionBody).toContain("p_children_5_10 < 0");
    expect(functionBody).toContain("'invalid_counts'");
  });

  it("imposes no business count maximum", () => {
    // No 0-to-2 or <= 2 cap is applied to the adjusted party anywhere in the
    // function. The academy raises or lowers a party freely.
    expect(functionBody).not.toContain("between 0 and 2");
    expect(functionBody).not.toMatch(/registered_adult_guests\s*[<>]=?\s*2/);
    expect(functionBody).not.toMatch(/p_adult_guest_count\s*>\s*2/);
  });

  it("validates adult guest names and rejects an excess of names", () => {
    expect(functionBody).toContain("jsonb_typeof(p_adult_guest_names)");
    expect(functionBody).toContain("'invalid_guest_names'");
    expect(functionBody).toContain(
      "jsonb_array_length(p_adult_guest_names) > p_adult_guest_count"
    );
    expect(functionBody).toContain("'too_many_guest_names'");
  });

  it("updates only the selected registration's party count fields", () => {
    expect(functionBody).toContain(
      "update public.graduation_registrations"
    );
    expect(functionBody).toContain("registered_adult_guests = p_adult_guest_count");
    expect(functionBody).toContain("registered_children_0_4 = p_children_0_4");
    expect(functionBody).toContain("registered_children_5_10 = p_children_5_10");
    // It never touches contact, payment, status or event fields.
    expect(functionBody).not.toContain("set email =");
    expect(functionBody).not.toContain("payment_status =");
    expect(functionBody).not.toContain("registration_status =");
    expect(functionBody).not.toContain("event_id =");
  });

  it("replaces only this registration's adult guest-name rows", () => {
    expect(functionBody).toContain(
      "delete from public.registration_guests"
    );
    expect(functionBody).toContain("guest_category = 'adult'");
    expect(functionBody).toContain(
      "insert into public.registration_guests"
    );
  });

  it("never writes graduation_tickets and only reads the active ticket", () => {
    expect(functionBody).not.toContain("update public.graduation_tickets");
    expect(functionBody).not.toContain("insert into public.graduation_tickets");
    expect(functionBody).not.toContain("delete from public.graduation_tickets");
    // It reads the active ticket for the returned ID and code only.
    expect(functionBody).toContain(
      "from public.graduation_tickets"
    );
    expect(functionBody).toContain("status = 'active'");
  });

  it("writes before and after snapshots into one append-only audit row", () => {
    expect(functionBody).toContain(
      "insert into public.graduation_party_adjustments"
    );
    expect(functionBody).toContain("v_before");
    expect(functionBody).toContain("v_after");
    expect(functionBody).toContain("'before_party'");
    expect(functionBody).toContain("'after_party'");
  });

  it("is idempotent on the supplied key", () => {
    expect(functionBody).toContain("where idempotency_key = p_idempotency_key");
    expect(functionBody).toContain("'duplicate', true");
    expect(functionBody).toContain("when unique_violation then");
  });

  it("returns a clear no-change result that writes nothing", () => {
    expect(functionBody).toContain("v_no_change");
    expect(functionBody).toContain("'no_change', true");
    // The no-change branch returns before any update or audit insert.
    const noChangeIndex = functionBody.indexOf("if v_no_change then");
    const updateIndex = functionBody.indexOf(
      "update public.graduation_registrations"
    );
    expect(noChangeIndex).toBeGreaterThan(-1);
    expect(noChangeIndex).toBeLessThan(updateIndex);
  });

  it("returns the unchanged ticket id and code", () => {
    expect(functionBody).toContain("'ticket_id', v_ticket_id");
    expect(functionBody).toContain("'ticket_code', v_ticket_code");
  });

  it("revokes execution from public, anon and authenticated", () => {
    expect(dense).toContain(
      "revoke all on function public.update_graduation_registration_party(" +
        " uuid, uuid, integer, jsonb, integer, integer, text, text, text, timestamptz" +
        " ) from public, anon, authenticated"
    );
  });
});

describe("no destructive schema or type operation", () => {
  it("introduces no destructive table or type operation", () => {
    expect(code).not.toContain("drop table");
    expect(code).not.toContain("drop type");
    expect(code).not.toContain("drop column");
    expect(code).not.toContain("truncate");
    expect(code).not.toContain("rename to");
    expect(code).not.toContain("rename column");
  });

  it("only relaxes the registration party limits it intends to relax", () => {
    // The historic 0-to-2 caps are dropped and replaced with non-negative
    // checks; this is the documented point of the hotfix.
    expect(code).toContain(
      "drop constraint if exists graduation_registrations_adults_range"
    );
    expect(code).toContain("check (registered_adult_guests >= 0)");
    expect(code).toContain("check (registered_children_0_4 >= 0)");
    expect(code).toContain("check (registered_children_5_10 >= 0)");
    // The production Excel import reconciliation limits are never touched: no
    // executable statement references that table.
    expect(code).not.toContain("production_import_graduates");
  });

  it("only ever deletes adult guest rows, never any other table's rows", () => {
    const deletes = code.match(/delete from public\.[a-z_]+/g) ?? [];
    for (const statement of deletes) {
      expect(statement).toBe("delete from public.registration_guests");
    }
  });
});
