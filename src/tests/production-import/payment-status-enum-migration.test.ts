/**
 * Static safety checks on the CHECKIN-10B payment_status enum hotfix.
 *
 * Applying a reviewed production import failed in production with
 * PostgreSQL 42804: the CASE expression assigned to
 * graduation_registrations.payment_status resolved to text while the column
 * is public.payment_status. The fix ships as a new additive migration that
 * replaces the function; the already-deployed migration must stay exactly as
 * it was applied.
 *
 * These read the SQL only. Nothing here connects to a database and nothing
 * here deploys anything.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

const DEPLOYED_SUFFIX = "_create_manual_production_workflow.sql";
const HOTFIX_SUFFIX = "_fix_production_import_payment_status_enum.sql";

/**
 * SHA-256 of the deployed CHECKIN-10B migration with line endings normalised
 * to LF. It has already run against production, so any change to its bytes
 * is a change the database will never see. If this fails, the fix was edited
 * into the wrong file.
 */
const DEPLOYED_SHA256 =
  "5a9b9701e319c25879f13a3340b96281239f2e1fc145b5454c9335ec192b031d";

/** Reads one migration by filename suffix, asserting it is unambiguous. */
function readMigration(suffix: string): { fileName: string; sql: string } {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith(suffix)
  );
  expect(files, suffix).toHaveLength(1);
  return {
    fileName: files[0],
    sql: readFileSync(join(migrationsDir, files[0]), "utf8").replace(
      /\r\n/g,
      "\n"
    ),
  };
}

let hotfixFileName = "";
let hotfix = "";
/** The function body only, so header comments quoting the bug never match. */
let hotfixBody = "";
let deployedFileName = "";
let deployed = "";

beforeAll(() => {
  const hotfixFile = readMigration(HOTFIX_SUFFIX);
  hotfixFileName = hotfixFile.fileName;
  hotfix = hotfixFile.sql.toLowerCase();
  hotfixBody = hotfix.split("as $$")[1]?.split("\n$$;")[0] ?? "";
  expect(hotfixBody.length).toBeGreaterThan(0);

  const deployedFile = readMigration(DEPLOYED_SUFFIX);
  deployedFileName = deployedFile.fileName;
  deployed = deployedFile.sql;
});

describe("payment_status enum hotfix migration", () => {
  it("exists as a new additive migration after every earlier one", () => {
    const mine = hotfixFileName.slice(0, 14);
    const others = readdirSync(migrationsDir)
      .filter((file) => file !== hotfixFileName && file.endsWith(".sql"))
      .map((file) => file.slice(0, 14));
    expect(others.length).toBeGreaterThan(0);
    for (const other of others) {
      expect(mine > other, `${mine} must sort after ${other}`).toBe(true);
    }
  });

  it("leaves the already-deployed CHECKIN-10B migration untouched", () => {
    const actual = createHash("sha256").update(deployed).digest("hex");
    expect(
      actual,
      `${deployedFileName} has already been deployed and must not be edited`
    ).toBe(DEPLOYED_SHA256);
  });

  it("still shows the deployed migration carrying the unfixed expression", () => {
    // Proves the hotfix is what changes behaviour, not a quiet edit upstream.
    expect(deployed.toLowerCase()).toContain(
      "case when v_group.order_total > 0 then 'amount_recorded'\n             else 'unknown' end"
    );
  });

  it("replaces the function instead of creating or dropping one", () => {
    expect(hotfix).toContain(
      "create or replace function public.apply_production_registration_import(\n  p_import_id uuid,\n  p_applied_by uuid\n)"
    );
    expect(hotfix).not.toContain("drop function");
  });

  it("returns jsonb from the same two-argument signature", () => {
    expect(hotfix).toContain("returns jsonb");
    expect(hotfix).toContain("p_import_id uuid");
    expect(hotfix).toContain("p_applied_by uuid");
  });
});

describe("explicit enum casts", () => {
  it("casts payment_status in both the insert and the update path", () => {
    const amountRecorded = hotfixBody.match(
      /'amount_recorded'::public\.payment_status/g
    );
    const unknown = hotfixBody.match(/'unknown'::public\.payment_status/g);
    expect(amountRecorded).toHaveLength(2);
    expect(unknown).toHaveLength(2);
  });

  it("leaves no uncast payment_status literal behind", () => {
    // Every occurrence of either literal must carry the enum cast.
    for (const literal of ["'amount_recorded'", "'unknown'"]) {
      const total = hotfixBody.split(literal).length - 1;
      const cast =
        hotfixBody.split(`${literal}::public.payment_status`).length - 1;
      expect(cast, literal).toBe(total);
    }
  });

  it("casts the eligible registration_status in both paths", () => {
    const eligible = hotfixBody.match(
      /'eligible'::public\.registration_status/g
    );
    expect(eligible).toHaveLength(2);
  });

  it("leaves no uncast eligible literal behind", () => {
    const total = hotfixBody.split("'eligible'").length - 1;
    const cast =
      hotfixBody.split("'eligible'::public.registration_status").length - 1;
    expect(cast).toBe(total);
  });
});

describe("preserved security model", () => {
  it("keeps security definer and an empty search_path", () => {
    expect(hotfix).toContain("security definer");
    expect(hotfix).toContain("set search_path = ''");
  });

  it("reapplies the privilege revoke and grants nothing back", () => {
    expect(hotfix).toContain(
      "revoke all on function public.apply_production_registration_import(uuid, uuid)\n  from public, anon, authenticated"
    );
    expect(hotfix).not.toContain("grant ");
    expect(hotfix).not.toContain("to anon");
    expect(hotfix).not.toContain("to authenticated");
  });
});

describe("preserved apply behaviour", () => {
  it("keeps the source-order match ahead of the primary-order match", () => {
    expect(hotfix).toContain(
      "from public.registration_source_orders link\n    join public.production_import_source_orders src\n      on src.source_order_id = link.source_order_id"
    );
    expect(hotfix).toContain(
      "and source_registration_id = v_group.primary_source_order_id"
    );
  });

  it("keeps the idempotent source-order link upsert", () => {
    expect(hotfix).toContain("insert into public.registration_source_orders");
    expect(hotfix).toContain(
      "on conflict (event_id, source_order_id) do update"
    );
  });

  it("keeps the import status transitions and the applied stamp", () => {
    expect(hotfix).toContain("v_import.status <> 'preview_ready'");
    expect(hotfix).toContain("set status = 'applying'");
    expect(hotfix).toContain("set status = 'applied'");
    expect(hotfix).toContain("applied_by = p_applied_by");
  });

  it("applies approved groups only and skips the rest", () => {
    expect(hotfix).toContain("v_group.decision <> 'approved'");
    expect(hotfix).toContain("v_skipped := v_skipped + 1");
  });

  it("keeps guest and child counts sourced from the approved group", () => {
    expect(hotfix).toContain(
      "registered_adult_guests = v_group.approved_adult_guests"
    );
    expect(hotfix).toContain(
      "registered_children_0_4 = v_group.approved_children_0_4"
    );
    expect(hotfix).toContain(
      "registered_children_5_10 = v_group.approved_children_5_10"
    );
    expect(hotfix).toContain("exit when v_sort > v_group.approved_adult_guests");
  });

  it("keeps the registration code and payment amounts unchanged", () => {
    expect(hotfix).toContain("'reg-exp-' || v_group.primary_source_order_id");
    expect(hotfix).toContain("fee_total = v_group.fee_total");
    expect(hotfix).toContain("tax_total = v_group.tax_total");
    expect(hotfix).toContain("order_total = v_group.order_total");
  });

  it("returns the same result keys", () => {
    for (const key of [
      "'created_registrations', v_created",
      "'updated_registrations', v_updated",
      "'skipped_groups', v_skipped",
      "'linked_source_orders', v_orders_linked",
    ]) {
      expect(hotfix, key).toContain(key);
    }
  });

  it("creates no ticket, no pdf and no check-in", () => {
    expect(hotfix).not.toContain("insert into public.graduation_tickets");
    expect(hotfix).not.toContain(
      "insert into public.graduation_ticket_documents"
    );
    expect(hotfix).not.toContain("insert into public.graduation_checkins");
  });
});

describe("no destructive statement", () => {
  it("introduces no drop, truncate or table-wide delete", () => {
    for (const forbidden of [
      "drop table",
      "drop type",
      "drop column",
      "drop constraint",
      "drop index",
      "drop trigger",
      "drop function",
      "truncate",
      "alter type",
      "alter column",
      "delete from public.graduation_registrations",
      "delete from public.graduation_tickets",
      "delete from public.graduation_checkins",
      "delete from public.registration_source_orders",
      "delete from public.production_import_graduates",
    ]) {
      expect(hotfix, forbidden).not.toContain(forbidden);
    }
  });

  it("keeps the adult guest-row replacement scoped to one registration", () => {
    // The only delete the function performs, unchanged from the deployed
    // version: adult guest names for the registration being applied.
    const deletes = hotfixBody.match(/delete from/g) ?? [];
    expect(deletes).toHaveLength(1);
    expect(hotfix).toContain(
      "delete from public.registration_guests\n    where registration_id = v_registration_id\n      and guest_category = 'adult'"
    );
  });

  it("creates no table and no type", () => {
    expect(hotfix).not.toContain("create table");
    expect(hotfix).not.toContain("create type");
  });
});
