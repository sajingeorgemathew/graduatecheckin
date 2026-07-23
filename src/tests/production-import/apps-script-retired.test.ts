/**
 * The Google Apps Script distribution workflow is retired, not deleted.
 *
 * Two things must both stay true: the production release must not require
 * Apps Script, a Google Sheet or a results CSV; and every line of that
 * code, every migration and every historical record must remain in place.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ACTIVE_DELIVERY_PATH,
  APPS_SCRIPT_DISTRIBUTION_ENABLED,
  ARCHIVED_AUTOMATION_LABEL,
} from "@/features/distribution/retirement";

function readSrc(relative: string): string {
  // Normalised so a CRLF checkout on Windows still matches the multi-line
  // snippets asserted below.
  return readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    "utf8"
  ).replace(/\r\n/g, "\n");
}

function repoPath(relative: string): string {
  return fileURLToPath(new URL(`../../../${relative}`, import.meta.url));
}

describe("Apps Script is not required for the production release", () => {
  it("is disabled behind an explicit feature flag", () => {
    expect(APPS_SCRIPT_DISTRIBUTION_ENABLED).toBe(false);
    expect(ARCHIVED_AUTOMATION_LABEL).toBe("Archived automation");
    expect(ACTIVE_DELIVERY_PATH).toBe("/admin/tickets/manual-delivery");
  });

  it("is absent from the administrator navigation", () => {
    const navigation = readSrc("features/auth/navigation.ts");
    expect(navigation).not.toContain("/admin/tickets/distribution");
  });

  it("is shown on the administration home only as archived", () => {
    const home = readSrc("app/admin/page.tsx");
    expect(home).toContain("ARCHIVED_AUTOMATION_LABEL");
    expect(home).toContain("APPS_SCRIPT_DISTRIBUTION_ENABLED");
    // The link is only rendered when the flag is turned back on.
    expect(home).toContain(
      "APPS_SCRIPT_DISTRIBUTION_ENABLED\n      ? \"/admin/tickets/distribution\"\n      : null"
    );
  });

  it("labels every distribution page as archived", () => {
    for (const page of [
      "app/admin/tickets/distribution/page.tsx",
      "app/admin/tickets/distribution/import-results/page.tsx",
      "app/admin/tickets/distribution/[batchCode]/page.tsx",
      "app/admin/tickets/distribution/import/[importId]/page.tsx",
    ]) {
      expect(readSrc(page), page).toContain("<ArchivedAutomationBanner />");
    }
  });

  it("routes ticket management to the Manual Delivery Desk instead", () => {
    const tickets = readSrc("app/admin/tickets/page.tsx");
    expect(tickets).toContain("/admin/tickets/manual-delivery");
    expect(tickets).not.toContain("/admin/tickets/distribution");
  });

  it("needs no Google Sheet and no results CSV to send a ticket", () => {
    for (const modulePath of [
      "features/manual-delivery/service.ts",
      "features/manual-delivery/read-service.ts",
      "features/manual-delivery/generation.ts",
      "features/manual-delivery/email-template.ts",
    ]) {
      const source = readSrc(modulePath);
      for (const forbidden of [
        "SpreadsheetApp",
        "send-queue",
        "sendQueue",
        "resultImport",
        "results/apply",
        "csv",
      ]) {
        expect(source, `${modulePath} / ${forbidden}`).not.toContain(
          forbidden
        );
      }
    }
  });
});

describe("nothing was deleted", () => {
  it("keeps every Apps Script source file", () => {
    for (const file of [
      "Code.gs",
      "Config.gs",
      "Sending.gs",
      "Results.gs",
      "Validation.gs",
      "BounceReview.gs",
      "appsscript.json",
    ]) {
      expect(
        existsSync(
          repoPath(`google-apps-script/graduation-ticket-sender/${file}`)
        ),
        file
      ).toBe(true);
    }
  });

  it("keeps the distribution feature code and its pages", () => {
    for (const modulePath of [
      "features/distribution/service.ts",
      "features/distribution/read-service.ts",
      "features/distribution/repository.ts",
      "features/distribution/send-queue.ts",
      "features/distribution/results.ts",
      "app/admin/tickets/distribution/page.tsx",
    ]) {
      expect(existsSync(repoPath(`src/${modulePath}`)), modulePath).toBe(true);
    }
  });

  it("keeps the distribution migrations exactly as deployed", () => {
    for (const file of [
      "supabase/migrations/20260721120000_create_ticket_distribution_delivery.sql",
      "supabase/migrations/20260721180000_create_result_import_row_audit.sql",
    ]) {
      expect(existsSync(repoPath(file)), file).toBe(true);
    }
  });
});
