import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildSeedSql } from "../../scripts/mock-data/generate-seed-sql";

const seedPath = fileURLToPath(
  new URL("../../supabase/seed.sql", import.meta.url)
);

describe("seed SQL generation", () => {
  it("is deterministic across runs", () => {
    expect(buildSeedSql()).toBe(buildSeedSql());
  });

  it("contains no schema creation statements", () => {
    const sql = buildSeedSql().toLowerCase();
    expect(sql).not.toContain("create table");
    expect(sql).not.toContain("create type");
    expect(sql).not.toContain("create extension");
    expect(sql).not.toContain("create index");
    expect(sql).not.toContain("create function");
    expect(sql).not.toContain("alter table");
    expect(sql).not.toContain("drop ");
    expect(sql).not.toContain("truncate");
  });

  it("contains only mock event, registration and guest data", () => {
    const sql = buildSeedSql();
    const insertTargets = [...sql.matchAll(/insert into ([\w.]+)/gi)].map(
      (match) => match[1]
    );
    expect(new Set(insertTargets)).toEqual(
      new Set([
        "public.graduation_events",
        "public.graduation_registrations",
        "public.registration_guests",
      ])
    );
    expect(sql).toContain("GRAD-2026-DEV");
    expect(sql).toContain("is_test");
  });

  it("does not create tickets, check-ins or Auth users", () => {
    const sql = buildSeedSql().toLowerCase();
    expect(sql).not.toContain("graduation_tickets");
    expect(sql).not.toContain("graduation_checkins");
    expect(sql).not.toContain("auth.users");
  });

  it("does not contain raw secrets or credential names", () => {
    const sql = buildSeedSql();
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sql).not.toContain("TICKET_TOKEN_SECRET");
    expect(sql.toLowerCase()).not.toContain("token");
    expect(sql.toLowerCase()).not.toContain("secret");
  });

  it("uses only visibly fictional contact data", () => {
    const sql = buildSeedSql();
    const emails = sql.match(/[\w.-]+@[\w.-]+/g) ?? [];
    expect(emails.length).toBeGreaterThan(0);
    for (const email of emails) {
      expect(email.endsWith("@example.com")).toBe(true);
    }
  });

  it("matches the committed supabase/seed.sql", () => {
    const committed = readFileSync(seedPath, "utf8");
    expect(committed).toBe(buildSeedSql());
  });
});
