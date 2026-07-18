import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Static safety audit of the ticket routes and pages. Every handler must
 * authorize independently, private responses must use no-store caching
 * and no route may log or expose raw tokens or QR payloads.
 */

const srcDir = fileURLToPath(new URL("../..", import.meta.url));

function read(relative: string): string {
  return readFileSync(join(srcDir, ...relative.split("/")), "utf8");
}

const TICKET_ROUTES = [
  "app/api/admin/tickets/generate/route.ts",
  "app/api/admin/tickets/[ticketId]/qr/route.ts",
  "app/api/admin/tickets/[ticketId]/replace/route.ts",
  "app/api/admin/tickets/[ticketId]/revoke/route.ts",
] as const;

const TICKET_PAGES = [
  "app/admin/tickets/page.tsx",
  "app/admin/tickets/generate/page.tsx",
  "app/admin/tickets/[ticketId]/page.tsx",
] as const;

describe("ticket route safety", () => {
  it("guards every ticket API route with a server-side administrator check", () => {
    for (const route of TICKET_ROUTES) {
      const source = read(route);
      expect(source, route).toContain("requireAdministrator");
      expect(source, route).toContain("guardFailureResponse");
    }
  });

  it("guards every ticket page independently of the layout and proxy", () => {
    for (const page of TICKET_PAGES) {
      expect(read(page), page).toContain("requireAdministratorPage");
    }
  });

  it("serves the QR image privately with no-store caching", () => {
    const source = read("app/api/admin/tickets/[ticketId]/qr/route.ts");
    expect(source).toContain("private, no-store");
    expect(source).toContain("image/svg+xml");
    expect(source).toContain("ticketIdSchema");
  });

  it("never logs tokens or QR payloads in ticket code", () => {
    const sources = [
      ...TICKET_ROUTES.map(read),
      ...TICKET_PAGES.map(read),
      read("features/tickets/token.ts"),
      read("features/tickets/qr-payload.ts"),
      read("features/tickets/qr-renderer.ts"),
      read("features/tickets/generation.ts"),
      read("features/tickets/replacement.ts"),
      read("features/tickets/revocation.ts"),
      read("features/tickets/repository.ts"),
      read("features/tickets/service.ts"),
    ];
    for (const source of sources) {
      expect(source).not.toContain("console.log");
      expect(source).not.toContain("console.error");
      expect(source).not.toContain("console.debug");
    }
  });

  it("keeps the QR payload out of URLs and redirects", () => {
    for (const file of [...TICKET_PAGES, "features/tickets/components/generation-preview.tsx", "features/tickets/components/ticket-actions.tsx"]) {
      const source = read(file);
      expect(source, file).not.toContain("TAE-GRAD1");
      expect(source, file).not.toContain("buildTicketToken");
    }
  });

  it("imports the qrcode package only in server-side modules", () => {
    const renderer = read("features/tickets/qr-renderer.ts");
    expect(renderer).toContain('import "server-only"');
    expect(renderer).toContain("qrcode");
    for (const clientComponent of [
      "features/tickets/components/generation-preview.tsx",
      "features/tickets/components/ticket-actions.tsx",
      "features/tickets/components/ticket-card.tsx",
    ]) {
      expect(read(clientComponent), clientComponent).not.toContain(
        'from "qrcode"'
      );
    }
  });

  it("keeps token hashes out of browser-facing view types", () => {
    const types = read("features/tickets/types.ts");
    const viewSection = types.slice(types.indexOf("TicketListRow"));
    expect(viewSection).not.toContain("token_hash");
    expect(viewSection).not.toContain("tokenHash");
  });
});
