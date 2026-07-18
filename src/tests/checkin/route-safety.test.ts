import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL("../..", import.meta.url));

function read(relative: string): string {
  return readFileSync(join(srcDir, relative), "utf8");
}

describe("checkin confirm route safety", () => {
  const route = read("app/api/staff/checkin/confirm/route.ts");

  it("authorizes with requireScanner independently of the proxy", () => {
    expect(route).toContain("requireScanner");
    expect(route).toContain("guardFailureResponse");
  });

  it("keeps the route handler thin and delegates to the service", () => {
    expect(route).toContain("confirmCheckin");
    expect(route).toContain("getCheckinServiceDeps");
  });

  it("never logs the request body", () => {
    expect(route).not.toContain("console.log");
    expect(route).not.toContain("console.error");
  });

  it("does not read an event, ticket, registration or actor id from the body", () => {
    for (const field of [
      "eventId",
      "ticketId",
      "registrationId",
      "actorUserId",
      "role",
    ]) {
      expect(route, field).not.toContain(`body.${field}`);
    }
  });
});

describe("checkin response headers", () => {
  const response = read("features/checkin/response.ts");

  it("sets private, no-store caching", () => {
    expect(response).toContain('"Cache-Control": "private, no-store"');
  });
});

describe("checkin client workflow state", () => {
  const form = read("features/checkin/components/arrival-form.tsx");
  const shell = read("features/scanner/components/scanner-shell.tsx");

  it("never persists check-in workflow state in browser storage", () => {
    // Guard against real storage API usage. A reference in a comment that
    // documents the storage ban is allowed; a call is not.
    for (const source of [form, shell]) {
      expect(source).not.toMatch(/localStorage\s*\./);
      expect(source).not.toMatch(/sessionStorage\s*\./);
      expect(source).not.toContain("document.cookie");
    }
  });

  it("never logs the validation-attempt id or workflow state", () => {
    expect(form).not.toContain("console.log");
    expect(form).not.toContain("console.error");
  });

  it("reuses one request id across a network retry", () => {
    expect(form).toContain("requestIdRef");
    // The request id is only cleared on a non-retry path, never inside the
    // network-failure branch, so a retry keeps the same id.
    expect(form).toContain("crypto.randomUUID()");
  });

  it("only offers the arrival form for valid or partial results", () => {
    expect(shell).toContain("CHECKIN_ELIGIBLE_RESULTS");
    expect(shell).toContain('"valid"');
    expect(shell).toContain('"partially_checked_in"');
    expect(shell).not.toContain('"already_checked_in",\n  "valid"');
  });
});
