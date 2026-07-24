/**
 * Static safety checks on the CHECKIN-10B migration.
 *
 * These read the SQL and prove the additive, idempotent and append-only
 * guarantees are actually written down, without connecting to a database
 * and without deploying anything.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

const NEW_TABLES = [
  "production_registration_imports",
  "production_import_graduates",
  "production_import_source_orders",
  "registration_source_orders",
  "graduation_manual_ticket_sends",
  "graduate_roster_candidates",
] as const;

let migration = "";
let fileName = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_create_manual_production_workflow.sql")
  );
  expect(files).toHaveLength(1);
  fileName = files[0];
  // Normalised so a CRLF checkout on Windows still matches the multi-line
  // constraint and revoke snippets asserted below.
  migration = readFileSync(join(migrationsDir, fileName), "utf8")
    .replace(/\r\n/g, "\n")
    .toLowerCase();
});

/**
 * Migrations added after CHECKIN-10B. This migration must still sort after
 * everything that preceded it, but later work is expected to sort after
 * this one, so those files are excluded from the ordering check.
 */
const LATER_MIGRATIONS = [
  "_fix_production_import_payment_status_enum.sql",
  "_create_party_adjustment_controls.sql",
] as const;

describe("manual production workflow migration", () => {
  it("is timestamped after every previously deployed migration", () => {
    const others = readdirSync(migrationsDir)
      .filter(
        (file) =>
          file !== fileName &&
          file.endsWith(".sql") &&
          !LATER_MIGRATIONS.some((later) => file.endsWith(later))
      )
      .map((file) => file.slice(0, 14));
    const mine = fileName.slice(0, 14);
    for (const other of others) {
      expect(mine > other, `${mine} must sort after ${other}`).toBe(true);
    }
  });

  it("is purely additive: it never drops, deletes or truncates", () => {
    for (const forbidden of [
      "drop table",
      "drop column",
      "drop type",
      "drop function",
      "truncate",
      "delete from public.graduation_registrations",
      "delete from public.graduation_tickets",
      "delete from public.graduation_checkins",
      "alter type",
      "alter column",
    ]) {
      expect(migration, forbidden).not.toContain(forbidden);
    }
  });

  it("never touches the archived Apps Script distribution tables", () => {
    // CHECKIN-09B and CHECKIN-09C records stay exactly as they are.
    for (const table of [
      "graduation_ticket_delivery_batches",
      "graduation_ticket_deliveries",
      "graduation_ticket_delivery_attempts",
      "graduation_ticket_delivery_result_imports",
    ]) {
      expect(migration, table).not.toContain(`alter table public.${table}`);
      expect(migration, table).not.toContain(`drop table public.${table}`);
    }
  });

  it("creates every new table", () => {
    for (const table of NEW_TABLES) {
      expect(migration, table).toContain(
        `create table if not exists public.${table}`
      );
    }
  });

  it("enables row level security on every new table", () => {
    for (const table of NEW_TABLES) {
      expect(migration, table).toContain(
        `alter table public.${table} enable row level security`
      );
    }
  });

  it("revokes anonymous and authenticated privileges on every new table", () => {
    for (const table of NEW_TABLES) {
      expect(migration, table).toContain(
        `revoke all on table public.${table}\n  from anon, authenticated`
      );
    }
  });

  it("creates no policy and no unrestricted anonymous access", () => {
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("to anon");
    expect(migration).not.toContain("using (true)");
  });

  it("uses the approved 5 to 10 child wording, never 4 to 10", () => {
    expect(migration).toContain("children_5_10");
    expect(migration).not.toContain("children_4_10");
  });

  it("constrains approved guest and child counts exactly as registrations do", () => {
    expect(migration).toContain("approved_adult_guests between 0 and 2");
    expect(migration).toContain("approved_children_0_4 between 0 and 2");
    expect(migration).toContain("approved_children_5_10 between 0 and 2");
    expect(migration).toContain(
      "approved_children_0_4 + approved_children_5_10 <= 2"
    );
  });
});

describe("idempotent apply", () => {
  it("makes a source order unique per event, so a re-import cannot duplicate", () => {
    expect(migration).toContain(
      "constraint registration_source_orders_event_order_unique unique (\n    event_id, source_order_id\n  )"
    );
  });

  it("upserts source-order links instead of inserting a second row", () => {
    expect(migration).toContain("on conflict (event_id, source_order_id) do update");
  });

  it("only applies an import that is awaiting review", () => {
    expect(migration).toContain("v_import.status <> 'preview_ready'");
  });

  it("skips any graduate that is not approved", () => {
    expect(migration).toContain("v_group.decision <> 'approved'");
  });

  it("creates no ticket and no check-in when applying", () => {
    const applyFunction =
      migration.split("create or replace function public.apply_production_registration_import")[1] ??
      "";
    const body = applyFunction.split("$$;")[0] ?? "";
    expect(body).not.toContain("insert into public.graduation_tickets");
    expect(body).not.toContain("insert into public.graduation_checkins");
    expect(body).not.toContain("insert into public.graduation_ticket_documents");
  });

  it("never deletes a registration when applying", () => {
    expect(migration).not.toContain(
      "delete from public.graduation_registrations"
    );
  });
});

describe("manual delivery ledger", () => {
  it("is append-only: updates and deletes are blocked by a trigger", () => {
    expect(migration).toContain(
      "create trigger graduation_manual_ticket_sends_append_only"
    );
    expect(migration).toContain("before update or delete");
    expect(migration).toContain("is append-only");
  });

  it("prevents a double-click producing two attempts", () => {
    expect(migration).toContain(
      "constraint graduation_manual_ticket_sends_idempotency_unique unique"
    );
    // The function returns the existing attempt rather than raising.
    expect(migration).toContain("'duplicate', true");
  });

  it("records the manual-gmail provider and a sent outcome only", () => {
    expect(migration).toContain("provider = 'manual-gmail'");
    expect(migration).toContain("outcome = 'sent'");
  });

  it("requires a reason for a resend or a replacement", () => {
    expect(migration).toContain(
      "send_kind = 'initial' or (reason is not null and length(btrim(reason)) >= 5)"
    );
  });

  it("only ever records a send against an active ticket", () => {
    expect(migration).toContain("v_ticket.status <> 'active'");
  });

  it("keeps the first sent timestamp when a resend is recorded", () => {
    expect(migration).toContain("sent_at = coalesce(sent_at, now())");
  });
});
