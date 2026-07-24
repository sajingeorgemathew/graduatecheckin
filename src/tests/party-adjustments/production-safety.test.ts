import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Structural production-safety invariant for HOTFIX-PARTY-01.
 *
 * A party adjustment must preserve the exact same ticket and QR. This test
 * fails if the party-adjustment implementation ever:
 *   - updates or issues a graduation_tickets row,
 *   - invokes the ticket replacement service, or
 *   - imports a scanner or check-in mutation service.
 *
 * It also confirms the feature never reaches into the QR-token or check-in
 * source at all, so the scanner and check-in code stays untouched.
 */

const featureDir = fileURLToPath(
  new URL("../../features/party-adjustments", import.meta.url)
);
const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

function readFeatureSource(): string {
  return readdirSync(featureDir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => readFileSync(join(featureDir, file), "utf8"))
    .join("\n");
}

function readMigration(): string {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_create_party_adjustment_controls.sql")
  );
  expect(files).toHaveLength(1);
  return readFileSync(join(migrationsDir, files[0]), "utf8").toLowerCase();
}

describe("party-adjustment implementation never touches the ticket or QR", () => {
  const source = readFeatureSource();
  const migration = readMigration();

  it("never writes a graduation_tickets row", () => {
    // No SQL write to the tickets table in the migration.
    expect(migration).not.toContain("update public.graduation_tickets");
    expect(migration).not.toContain("insert into public.graduation_tickets");
    expect(migration).not.toContain("delete from public.graduation_tickets");
    // No application-layer ticket update either.
    expect(source).not.toMatch(
      /from\(\s*["']graduation_tickets["']\s*\)[^;]*\.update/
    );
  });

  it("never invokes the ticket replacement service", () => {
    expect(source).not.toContain("@/features/tickets/replacement");
    expect(source).not.toContain("replaceTicket");
    expect(source).not.toContain("replace_graduation_ticket");
    expect(source).not.toContain("invalidateDocumentsForTicket");
  });

  it("never imports a scanner or check-in mutation service", () => {
    expect(source).not.toContain("@/features/scanner");
    expect(source).not.toContain("@/features/checkin");
    expect(source).not.toContain("graduation_checkins");
    expect(source).not.toContain("apply_graduation_checkin");
  });

  it("never regenerates token or QR material", () => {
    expect(source).not.toContain("token_hash");
    expect(source).not.toContain("qr_payload");
    expect(source).not.toContain("@/features/tickets/token");
    expect(migration).not.toContain("token_hash");
    expect(migration).not.toContain("qr_payload");
  });

  it("does reuse the existing PDF generation service for the same ticket", () => {
    // The one sanctioned side effect: a new PDF version for the same ticket.
    expect(source).toContain("generateTicketDocument");
  });
});
