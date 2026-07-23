/**
 * Static authorization and safety coverage for the CHECKIN-10B routes,
 * pages and services.
 *
 * Every assertion reads source. Nothing here starts a server, touches a
 * database or sends an email.
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
  "app/api/admin/production-import/route.ts",
  "app/api/admin/production-import/[importId]/apply/route.ts",
  "app/api/admin/production-import/[importId]/cancel/route.ts",
  "app/api/admin/production-import/[importId]/graduates/[graduateId]/route.ts",
  "app/api/admin/tickets/generate-missing/route.ts",
  "app/api/admin/tickets/manual-delivery/mark-sent/route.ts",
  "app/api/admin/tickets/manual-delivery/resend/route.ts",
  "app/api/admin/tickets/manual-delivery/replace/route.ts",
  "app/api/admin/registrations/route.ts",
  "app/api/admin/registrations/duplicate-check/route.ts",
  "app/api/admin/roster/[candidateId]/register/route.ts",
];

const PAGES = [
  "app/admin/production-import/page.tsx",
  "app/admin/production-import/[importId]/page.tsx",
  "app/admin/tickets/manual-delivery/page.tsx",
  "app/admin/tickets/manual-delivery/[registrationId]/page.tsx",
  "app/admin/registrations/new/page.tsx",
  "app/admin/roster/page.tsx",
];

const SERVER_ONLY_MODULES = [
  "features/production-import/service.ts",
  "features/production-import/repository.ts",
  "features/production-import/apply.ts",
  "features/production-import/http.ts",
  "features/manual-delivery/repository.ts",
  "features/manual-delivery/read-service.ts",
  "features/manual-delivery/service.ts",
  "features/manual-delivery/generation.ts",
  "features/registrations/service.ts",
  "features/roster/service.ts",
];

describe("route authorization", () => {
  it("requires an administrator in every new route", () => {
    for (const route of ROUTES) {
      const source = read(route);
      expect(source, route).toContain("requireAdministrator");
      expect(source, route).toContain("guardFailureResponse");
    }
  });

  it("never gates a new route on a scanner or supervisor guard", () => {
    // A supervisor must not import a workbook, reconcile guest payments,
    // generate bulk tickets, edit a registration, use the email tools,
    // mark a send or replace a ticket.
    for (const route of ROUTES) {
      const source = read(route);
      expect(source, route).not.toContain("requireScanner");
      expect(source, route).not.toContain("requireSupervisor");
      expect(source, route).not.toContain("requireStaffSession");
    }
  });

  it("uses force-dynamic and the node runtime in every new route", () => {
    for (const route of ROUTES) {
      const source = read(route);
      expect(source, route).toContain('dynamic = "force-dynamic"');
      expect(source, route).toContain('runtime = "nodejs"');
    }
  });

  it("guards every new admin page independently of the layout and proxy", () => {
    for (const page of PAGES) {
      expect(read(page), page).toContain("requireAdministratorPage");
    }
  });

  it("re-verifies administrator access inside every service", () => {
    for (const modulePath of [
      "features/manual-delivery/read-service.ts",
      "features/manual-delivery/service.ts",
      "features/manual-delivery/generation.ts",
      "features/registrations/service.ts",
      "features/roster/service.ts",
    ]) {
      expect(read(modulePath), modulePath).toContain("canAccessAdmin");
    }
    for (const modulePath of [
      "features/production-import/service.ts",
      "features/production-import/apply.ts",
    ]) {
      expect(read(modulePath), modulePath).toContain(
        "canImportRegistrations"
      );
    }
  });

  it("keeps every privileged module server-only", () => {
    for (const modulePath of SERVER_ONLY_MODULES) {
      expect(read(modulePath), modulePath).toMatch(
        /^\s*import\s+["']server-only["']/m
      );
    }
  });
});

describe("the application never sends email", () => {
  it("uses no mail transport anywhere in the new feature code", () => {
    for (const modulePath of [
      ...SERVER_ONLY_MODULES,
      "features/manual-delivery/email-template.ts",
      "features/manual-delivery/summaries.ts",
      "features/manual-delivery/constants.ts",
    ]) {
      const source = read(modulePath);
      for (const forbidden of [
        "nodemailer",
        "sendMail",
        "sendEmail",
        "MailApp",
        "GmailApp",
        "smtp",
        "resend.emails",
      ]) {
        expect(source, `${modulePath} / ${forbidden}`).not.toContain(
          forbidden
        );
      }
    }
  });

  it("makes no network request while rendering an email", () => {
    const source = read("features/manual-delivery/email-template.ts");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("XMLHttpRequest");
  });

  it("records a send only through the append-only manual ledger", () => {
    const source = read("features/manual-delivery/service.ts");
    expect(source).toContain("recordManualSendRpc");
    // The read path never writes: opening the desk marks nothing as sent.
    expect(read("features/manual-delivery/read-service.ts")).not.toContain(
      "recordManualSendRpc"
    );
  });

  it("keeps a resend and a replacement as separate actions", () => {
    const source = read("features/manual-delivery/service.ts");
    // A resend records an attempt and never issues a new ticket.
    const resend = source.split("export async function recordResend")[1] ?? "";
    const resendBody = resend.split("export async function")[0] ?? "";
    expect(resendBody).not.toContain("replaceTicketCore");
    expect(resendBody).not.toContain("invalidateDocumentsForTicket");
    expect(resendBody).toContain('sendKind: "resend"');

    // A replacement issues a new ticket and invalidates the old PDF.
    const replace =
      source.split("export async function replaceTicketForDelivery")[1] ?? "";
    expect(replace).toContain("replaceTicketCore");
    expect(replace).toContain("invalidateDocumentsForTicket");
    expect(replace).toContain("generateTicketDocument");
  });
});

describe("supervisor and scanner boundaries hold", () => {
  it("keeps the delivery desk out of the supervisor navigation", () => {
    const navigation = read("features/auth/navigation.ts");
    // Only the administrator branch adds the delivery and import links.
    const adminBranch =
      navigation.split("if (canAccessAdmin(session.role))")[1] ?? "";
    expect(adminBranch).toContain("MANUAL_DELIVERY_PATH");
    expect(adminBranch).toContain("/admin/production-import");
  });

  it("leaves the scanner and check-in permissions untouched", () => {
    const permissions = read("features/auth/permissions.ts");
    expect(permissions).toContain("canImportRegistrations");
    expect(permissions).toContain("canAccessAdmin");
    // Supervisors still reach the supervisor-level guards used by scanning
    // and manual check-in; nothing in this release narrows them.
    const guards = read("features/auth/guards.ts");
    expect(guards).toContain("requireSupervisor");
    expect(guards).toContain("requireScanner");
  });
});
