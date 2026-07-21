/**
 * Static safety audit of the ticket-document routes, pages and services.
 *
 * Every handler must authorize independently, run on the Node.js runtime,
 * serve private responses with no-store caching, and never log or expose a
 * raw token, a token hash, a signing secret or a storage URL.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL("../..", import.meta.url));

function read(relative: string): string {
  return readFileSync(join(srcDir, ...relative.split("/")), "utf8");
}

const DOCUMENT_ROUTES = [
  "app/api/admin/ticket-documents/generate/route.ts",
  "app/api/admin/ticket-documents/[documentId]/file/route.ts",
  "app/api/admin/ticket-documents/batches/route.ts",
  "app/api/admin/ticket-documents/batches/[batchId]/download/route.ts",
  "app/api/admin/ticket-documents/batches/[batchId]/cancel/route.ts",
] as const;

const DOCUMENT_PAGES = ["app/admin/tickets/documents/page.tsx"] as const;

const SERVER_MODULES = [
  "features/ticket-documents/service.ts",
  "features/ticket-documents/storage.ts",
  "features/ticket-documents/repository.ts",
  "features/ticket-documents/batches.ts",
  "features/ticket-documents/render.ts",
  "features/ticket-documents/read-service.ts",
  "features/ticket-documents/assets.ts",
] as const;

describe("ticket document route safety", () => {
  it("guards every route with a server-side administrator check", () => {
    for (const route of DOCUMENT_ROUTES) {
      const source = read(route);
      expect(source, route).toContain("requireAdministrator");
      expect(source, route).toContain("guardFailureResponse");
    }
  });

  it("never guards a document route with a scanner or supervisor role", () => {
    for (const route of DOCUMENT_ROUTES) {
      const source = read(route);
      expect(source, route).not.toContain("requireScanner");
      expect(source, route).not.toContain("requireSupervisor");
    }
  });

  it("guards the administration page independently of the layout", () => {
    for (const page of DOCUMENT_PAGES) {
      expect(read(page), page).toContain("requireAdministratorPage");
    }
  });

  it("runs every document route on the Node.js runtime", () => {
    for (const route of DOCUMENT_ROUTES) {
      expect(read(route), route).toContain('runtime = "nodejs"');
    }
  });

  it("serves the stored PDF privately with no-store caching", () => {
    const source = read(
      "app/api/admin/ticket-documents/[documentId]/file/route.ts"
    );
    expect(source).toContain("private, no-store");
    expect(source).toContain("application/pdf");
    expect(source).toContain("documentIdSchema");
    expect(source).toContain("nosniff");
  });

  it("serves the batch archive privately with no-store caching", () => {
    const source = read(
      "app/api/admin/ticket-documents/batches/[batchId]/download/route.ts"
    );
    expect(source).toContain("private, no-store");
    expect(source).toContain("application/zip");
  });

  it("validates every route input with a schema", () => {
    expect(read(DOCUMENT_ROUTES[0])).toContain("safeParse");
    expect(read(DOCUMENT_ROUTES[1])).toContain("safeParse");
    expect(read(DOCUMENT_ROUTES[2])).toContain("safeParse");
    expect(read(DOCUMENT_ROUTES[3])).toContain("safeParse");
    expect(read(DOCUMENT_ROUTES[4])).toContain("safeParse");
  });

  it("rate limits the expensive generation and export routes", () => {
    expect(read(DOCUMENT_ROUTES[0])).toContain("consumeRateLimit");
    expect(read(DOCUMENT_ROUTES[2])).toContain("consumeRateLimit");
    expect(read(DOCUMENT_ROUTES[3])).toContain("consumeRateLimit");
  });

  it("requires typed confirmation before bulk generation and batch creation", () => {
    const schemas = read("features/ticket-documents/schemas.ts");
    expect(schemas).toContain("GENERATE_DOCUMENTS_CONFIRMATION_TEXT");
    expect(schemas).toContain("CREATE_BATCH_CONFIRMATION_TEXT");
  });

  it("keeps every privileged module server-only", () => {
    for (const modulePath of SERVER_MODULES) {
      expect(read(modulePath), modulePath).toContain('import "server-only"');
    }
  });

  it("never logs a token, secret or storage path", () => {
    const sources = [
      ...DOCUMENT_ROUTES.map(read),
      ...DOCUMENT_PAGES.map(read),
      ...SERVER_MODULES.map(read),
      read("features/ticket-documents/document.tsx"),
      read("features/ticket-documents/manifest.ts"),
    ];
    for (const source of sources) {
      expect(source).not.toMatch(/console\.(log|info|warn|error)\s*\([^)]*token/i);
      expect(source).not.toMatch(/console\.(log|info|warn|error)\s*\([^)]*secret/i);
      expect(source).not.toMatch(
        /console\.(log|info|warn|error)\s*\([^)]*storage_path/i
      );
    }
  });

  it("never persists or returns a raw QR token", () => {
    const render = read("features/ticket-documents/render.ts");
    // The token is built, drawn and discarded inside the renderer.
    expect(render).toContain("buildTicketToken");
    expect(render).not.toContain("return token");
    const service = read("features/ticket-documents/service.ts");
    expect(service).not.toContain("buildTicketToken");
    expect(service).not.toContain("token_hash");
  });

  it("never sends the service-role key to the browser", () => {
    const client = read("features/ticket-documents/components/document-workspace.tsx");
    expect(client).not.toContain("SERVICE_ROLE");
    expect(client).not.toContain("getSupabaseAdminClient");
    const section = read(
      "features/ticket-documents/components/document-section.tsx"
    );
    expect(section).not.toContain("SERVICE_ROLE");
    expect(section).not.toContain("getSupabaseAdminClient");
  });

  it("never produces a permanent public storage URL", () => {
    const storage = read("features/ticket-documents/storage.ts");
    expect(storage).not.toContain("getPublicUrl");
    expect(storage).toContain("createSignedUrl");
  });

  it("uploads without overwriting a prior PDF object", () => {
    expect(read("features/ticket-documents/storage.ts")).toContain(
      "upsert: false"
    );
  });

  it("cleans up storage when database finalization fails", () => {
    const service = read("features/ticket-documents/service.ts");
    expect(service).toContain("removeTicketDocumentQuietly");
    // Cleanup must be attempted on every finalization failure path.
    const cleanupCount = service.split("removeTicketDocumentQuietly").length - 1;
    expect(cleanupCount).toBeGreaterThanOrEqual(3);
  });

  it("does not generate or export anything on page load", () => {
    const page = read("app/admin/tickets/documents/page.tsx");
    expect(page).not.toContain("generateTicketDocument");
    expect(page).not.toContain("createExportBatch");
    expect(page).not.toContain("buildBatchZip");
  });

  it("sends no email and imports no email or delivery provider", () => {
    // Matched against imports and calls rather than prose, so the modules
    // may still document in comments that CHECKIN-09A does not send email.
    const forbidden = [
      /from\s+["'][^"']*(resend|nodemailer|googleapis|@sendgrid|postmark)/i,
      /require\s*\(\s*["'][^"']*(resend|nodemailer|googleapis)/i,
      /\bsendMail\s*\(/i,
      /\bsendEmail\s*\(/i,
      /gmail\.users\./i,
      /ScriptApp|MailApp|GmailApp/,
    ];
    const sources = [
      ...DOCUMENT_ROUTES.map(read),
      ...SERVER_MODULES.map(read),
      read("features/ticket-documents/manifest.ts"),
    ];
    for (const source of sources) {
      for (const pattern of forbidden) {
        expect(source).not.toMatch(pattern);
      }
    }
  });

  it("declares no email or delivery dependency in package.json", () => {
    const manifest = JSON.parse(
      readFileSync(join(srcDir, "..", "package.json"), "utf8")
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const names = [
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.devDependencies),
    ];
    for (const forbidden of [
      "resend",
      "nodemailer",
      "googleapis",
      "@sendgrid/mail",
      "postmark",
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });
});

describe("existing functionality remains intact", () => {
  it("keeps the existing web ticket components in place", () => {
    for (const file of [
      "features/tickets/components/ticket-card.tsx",
      "features/tickets/components/ticket-actions.tsx",
      "features/tickets/components/ticket-list.tsx",
      "features/tickets/qr-renderer.ts",
      "features/tickets/qr-payload.ts",
      "features/tickets/token.ts",
    ]) {
      expect(read(file).length, file).toBeGreaterThan(0);
    }
  });

  it("keeps the existing ticket QR route unchanged in contract", () => {
    const source = read("app/api/admin/tickets/[ticketId]/qr/route.ts");
    expect(source).toContain("renderQrSvg");
    expect(source).toContain("image/svg+xml");
  });

  it("keeps the scanner validation route present", () => {
    expect(read("app/api/staff/scanner/validate/route.ts").length).toBeGreaterThan(0);
  });

  it("keeps the attendance dashboard present", () => {
    expect(read("app/staff/attendance/page.tsx").length).toBeGreaterThan(0);
    expect(read("app/api/staff/attendance/summary/route.ts").length).toBeGreaterThan(0);
  });

  it("adds the PDF section to the ticket detail page without replacing the web ticket", () => {
    const page = read("app/admin/tickets/[ticketId]/page.tsx");
    expect(page).toContain("TicketCard");
    expect(page).toContain("DocumentSection");
  });

  it("links to the documents page from ticket management", () => {
    expect(read("app/admin/tickets/page.tsx")).toContain(
      "/admin/tickets/documents"
    );
  });

  it("invalidates documents on ticket replacement and revocation", () => {
    expect(read("app/api/admin/tickets/[ticketId]/replace/route.ts")).toContain(
      "invalidateDocumentsForTicket"
    );
    expect(read("app/api/admin/tickets/[ticketId]/revoke/route.ts")).toContain(
      "invalidateDocumentsForTicket"
    );
  });

  it("never resets attendance from document code", () => {
    for (const modulePath of SERVER_MODULES) {
      const source = read(modulePath);
      expect(source, modulePath).not.toContain("graduation_checkins");
      expect(source, modulePath).not.toContain("apply_graduation_checkin");
      expect(source, modulePath).not.toContain("reverse_graduation_checkin");
    }
  });
});
