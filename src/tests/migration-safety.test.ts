import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(
  new URL("../../supabase/migrations", import.meta.url)
);

const REQUIRED_TABLES = [
  "graduation_events",
  "graduation_registrations",
  "registration_guests",
  "graduation_tickets",
  "staff_profiles",
  "graduation_checkins",
] as const;

let migration = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_create_graduation_checkin_schema.sql")
  );
  expect(files).toHaveLength(1);
  migration = readFileSync(join(migrationsDir, files[0]), "utf8").toLowerCase();
});

describe("migration safety", () => {
  it("creates all six required tables", () => {
    for (const table of REQUIRED_TABLES) {
      expect(migration).toContain(`create table public.${table}`);
    }
  });

  it("enables row level security on all six tables", () => {
    for (const table of REQUIRED_TABLES) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`
      );
    }
  });

  it("revokes anonymous and authenticated privileges on all six tables", () => {
    for (const table of REQUIRED_TABLES) {
      expect(migration).toContain(
        `revoke all on table public.${table} from anon, authenticated`
      );
    }
  });

  it("creates no unrestricted anonymous policy", () => {
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("to anon");
    expect(migration).not.toContain("using (true)");
  });

  it("stores only hashed ticket tokens", () => {
    expect(migration).toContain("token_hash text not null");
    const ticketTableMatch = migration.match(
      /create table public\.graduation_tickets \(([\s\S]*?)\n\);/
    );
    expect(ticketTableMatch).not.toBeNull();
    const ticketColumns = ticketTableMatch?.[1] ?? "";
    expect(/\n\s{2}token\s/.test(ticketColumns)).toBe(false);
  });

  it("constrains registration guest counts", () => {
    expect(migration).toContain("registered_adult_guests between 0 and 2");
    expect(migration).toContain("registered_children_0_4 between 0 and 2");
    expect(migration).toContain("registered_children_5_10 between 0 and 2");
  });

  it("constrains combined child counts", () => {
    expect(migration).toContain(
      "registered_children_0_4 + registered_children_5_10 <= 2"
    );
  });

  it("enforces check-in idempotency uniqueness", () => {
    expect(migration).toContain("graduation_checkins_idempotency_key_unique");
    expect(migration).toMatch(
      /idempotency_key_unique unique \(\s*idempotency_key\s*\)/
    );
  });

  it("uses the approved child_5_10 category, never child_4_10", () => {
    expect(migration).toContain("child_5_10");
    expect(migration).not.toContain("child_4_10");
  });
});
