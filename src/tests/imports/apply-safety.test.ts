import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";
import { canApplyStatus, parseApplySummary } from "@/features/imports/apply";
import {
  buildNormalizedSnapshot,
  computeRowCounts,
  snapshotComparisonAction,
} from "@/features/imports/summaries";
import type { RegistrationImportStatus } from "@/types/database";

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

let migration = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_create_registration_import_pipeline.sql")
  );
  expect(files).toHaveLength(1);
  migration = readFileSync(join(migrationsDir, files[0]), "utf8").toLowerCase();
});

describe("apply status gate", () => {
  it("allows applying only preview_ready imports", () => {
    const statuses: RegistrationImportStatus[] = [
      "uploaded",
      "preview_ready",
      "applying",
      "applied",
      "failed",
      "cancelled",
      "duplicate",
    ];
    for (const status of statuses) {
      expect(canApplyStatus(status)).toBe(status === "preview_ready");
    }
  });

  it("never allows reapplying an applied import", () => {
    expect(canApplyStatus("applied")).toBe(false);
  });

  it("never allows applying a duplicate import", () => {
    expect(canApplyStatus("duplicate")).toBe(false);
  });
});

describe("apply summary parsing", () => {
  it("reads summary counts from the database result", () => {
    expect(
      parseApplySummary({
        applied_new: 3,
        applied_updated: 2,
        applied_unchanged: 1,
        skipped: 4,
      })
    ).toEqual({
      applied_new: 3,
      applied_updated: 2,
      applied_unchanged: 1,
      skipped: 4,
    });
  });

  it("defaults malformed results to zero counts", () => {
    expect(parseApplySummary(null)).toEqual({
      applied_new: 0,
      applied_updated: 0,
      applied_unchanged: 0,
      skipped: 0,
    });
  });
});

describe("snapshot round trip", () => {
  it("preserves the comparison action for warning rows", () => {
    const snapshot = buildNormalizedSnapshot(
      {
        source_row_number: 2,
        source_registration_id: "TEST-1",
        graduate_full_name: "Fictional Test Person",
        email: null,
        phone: null,
        gown_size: null,
        name_pronunciation: null,
        guest_1_name: null,
        guest_2_name: null,
        registered_adult_guests: 0,
        registered_children_0_4: 0,
        registered_children_5_10: 0,
        expected_party_size: 1,
        source_order_status: "processing",
        registration_status: "eligible",
        payment_status: "unknown",
        fee_total: 0,
        tax_total: 0,
        order_total: 0,
        source_order_date: null,
      },
      "update"
    );
    expect(snapshotComparisonAction(snapshot)).toBe("update");
    expect(snapshotComparisonAction({})).toBeNull();
    expect(snapshotComparisonAction(null)).toBeNull();
  });
});

describe("summary counting", () => {
  it("counts warning rows in both the warning and action totals", () => {
    const counts = computeRowCounts([
      { result: "new", comparison_action: "new" },
      { result: "warning", comparison_action: "new" },
      { result: "update", comparison_action: "update" },
      { result: "unchanged", comparison_action: "unchanged" },
      { result: "error", comparison_action: null },
      { result: "excluded", comparison_action: "new" },
    ]);
    expect(counts).toEqual({
      total_rows: 6,
      new_rows: 2,
      updated_rows: 1,
      unchanged_rows: 1,
      warning_rows: 1,
      error_rows: 1,
      excluded_rows: 1,
    });
  });
});

describe("database apply function safety", () => {
  it("only applies rows with reviewable results", () => {
    expect(migration).toContain(
      "not in ('new', 'update', 'unchanged', 'warning')"
    );
  });

  it("requires the preview_ready status before applying", () => {
    expect(migration).toContain("v_import.status <> 'preview_ready'");
  });

  it("blocks applying an identical file twice for the same event", () => {
    expect(migration).toContain("registration_imports_applied_file_unique");
    expect(migration).toContain("where status = 'applied'");
    expect(migration).toContain(
      "an identical file has already been applied to this event"
    );
  });

  it("preserves existing registration ids by updating in place", () => {
    expect(migration).toContain("update public.graduation_registrations");
    expect(migration).toContain("where id = v_existing_id");
  });

  it("never deletes registrations or events", () => {
    expect(migration).not.toContain(
      "delete from public.graduation_registrations"
    );
    expect(migration).not.toContain("delete from public.graduation_events");
  });

  it("only replaces adult guest-name rows", () => {
    expect(migration).toContain("delete from public.registration_guests");
    expect(migration).toContain("and guest_category = 'adult'");
  });

  it("never creates tickets or check-ins", () => {
    expect(migration).not.toContain("insert into public.graduation_tickets");
    expect(migration).not.toContain("insert into public.graduation_checkins");
  });

  it("runs as security definer with a fixed empty search path", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
  });

  it("revokes execute from public, anon and authenticated", () => {
    expect(migration).toContain(
      "revoke all on function public.apply_registration_import(uuid) from public"
    );
    expect(migration).toContain(
      "revoke all on function public.apply_registration_import(uuid) from anon"
    );
    expect(migration).toContain(
      "revoke all on function public.apply_registration_import(uuid)\n  from authenticated"
    );
  });
});
