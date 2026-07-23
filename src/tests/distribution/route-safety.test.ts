/**
 * Static safety coverage for the distribution route handlers and pages.
 *
 * Every distribution route and admin page must require an administrator, so
 * scanner and supervisor staff are rejected. These assertions read source and
 * never start a server.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    "utf8"
  );
}

const ROUTES = [
  "app/api/admin/tickets/distribution/batches/route.ts",
  "app/api/admin/tickets/distribution/batches/[batchId]/send-queue/route.ts",
  "app/api/admin/tickets/distribution/batches/[batchId]/cancel/route.ts",
  "app/api/admin/tickets/distribution/results/preview/route.ts",
  "app/api/admin/tickets/distribution/results/apply/route.ts",
  // CHECKIN-10A
  "app/api/admin/tickets/distribution/external-deliveries/route.ts",
];

const PAGES = [
  "app/admin/tickets/distribution/page.tsx",
  "app/admin/tickets/distribution/import-results/page.tsx",
  "app/admin/tickets/distribution/[batchCode]/page.tsx",
  "app/admin/tickets/distribution/import/[importId]/page.tsx",
  // CHECKIN-10A
  "app/admin/tickets/distribution/production/page.tsx",
  "app/admin/tickets/distribution/runbook/page.tsx",
];

describe("distribution route safety", () => {
  it("requires an administrator in every route", () => {
    for (const route of ROUTES) {
      const source = read(route);
      expect(source, route).toContain("requireAdministrator");
      expect(source, route).toContain("guardFailureResponse");
    }
  });

  it("scanner and supervisor guards are never used to gate distribution routes", () => {
    for (const route of ROUTES) {
      const source = read(route);
      expect(source, route).not.toContain("requireScanner");
      expect(source, route).not.toContain("requireSupervisor");
    }
  });

  it("uses force-dynamic and the node runtime", () => {
    for (const route of ROUTES) {
      const source = read(route);
      expect(source, route).toContain('dynamic = "force-dynamic"');
      expect(source, route).toContain('runtime = "nodejs"');
    }
  });

  it("requires an administrator page guard on every admin page", () => {
    for (const page of PAGES) {
      expect(read(page), page).toContain("requireAdministratorPage");
    }
  });

  it("keeps the distribution repository and service server-only", () => {
    for (const modulePath of [
      "features/distribution/repository.ts",
      "features/distribution/service.ts",
      "features/distribution/secret.ts",
      "features/distribution/read-service.ts",
    ]) {
      expect(read(modulePath), modulePath).toMatch(
        /^\s*import\s+["']server-only["']/m
      );
    }
  });

  it("never exposes the distribution secret to the browser", () => {
    // The signing module (importable by the client-neutral layer) never reads
    // an environment variable; only the server-only secret helper does.
    expect(read("features/distribution/signing.ts")).not.toContain(
      "process.env."
    );
    expect(read("features/distribution/signing.ts")).not.toContain(
      "getServerEnv"
    );
  });
});
