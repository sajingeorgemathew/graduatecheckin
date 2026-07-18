import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Static safety audit of the scanner routes, pages and feature modules.
 * The validation route must authorize independently, responses must be
 * private and no-store, no module may log or store scanned values and
 * CHECKIN-06 must never write to graduation_checkins.
 */

const srcDir = fileURLToPath(new URL("../..", import.meta.url));

function read(relative: string): string {
  return readFileSync(join(srcDir, ...relative.split("/")), "utf8");
}

const SCANNER_SERVER_MODULES = [
  "features/scanner/service.ts",
  "features/scanner/repository.ts",
  "features/scanner/response.ts",
  "features/scanner/rate-limit.ts",
  "features/scanner/replacement-chain.ts",
  "features/scanner/attendance-summary.ts",
  "features/scanner/validation.ts",
  "app/api/staff/scanner/validate/route.ts",
  "app/staff/scanner/page.tsx",
] as const;

const SCANNER_CLIENT_MODULES = [
  "features/scanner/camera-controller.ts",
  "features/scanner/components/camera-scanner.tsx",
  "features/scanner/components/camera-status.tsx",
  "features/scanner/components/manual-code-form.tsx",
  "features/scanner/components/recent-validations.tsx",
  "features/scanner/components/scanner-result.tsx",
  "features/scanner/components/scanner-shell.tsx",
] as const;

describe("scanner route safety", () => {
  it("guards the validation route with a server-side scanner check", () => {
    const route = read("app/api/staff/scanner/validate/route.ts");
    expect(route).toContain("requireScanner");
    expect(route).toContain("guardFailureResponse");
  });

  it("serves validation responses privately with no-store caching", () => {
    const response = read("features/scanner/response.ts");
    expect(response).toContain("private, no-store");
    expect(response).toContain('import "server-only"');
  });

  it("keeps the repository and service server-only", () => {
    expect(read("features/scanner/repository.ts")).toContain(
      'import "server-only"'
    );
    expect(read("features/scanner/service.ts")).toContain(
      'import "server-only"'
    );
  });

  it("never writes to graduation_checkins anywhere in the feature", () => {
    for (const moduleFile of [...SCANNER_SERVER_MODULES, ...SCANNER_CLIENT_MODULES]) {
      const source = read(moduleFile);
      expect(source, moduleFile).not.toMatch(
        /graduation_checkins"\)[\s\S]{0,80}\.(insert|upsert|update|delete)\(/
      );
    }
    const repository = read("features/scanner/repository.ts");
    const checkinsSection = repository.slice(
      repository.indexOf('from("graduation_checkins")')
    );
    expect(checkinsSection.slice(0, 200)).toContain(".select(");
  });

  it("contains no CHECKIN-07 admission operation", () => {
    for (const moduleFile of [...SCANNER_SERVER_MODULES, ...SCANNER_CLIENT_MODULES]) {
      const source = read(moduleFile);
      expect(source, moduleFile).not.toContain("Confirm Check-In");
      expect(source, moduleFile).not.toContain("confirmCheckin");
      expect(source, moduleFile).not.toContain("recordAdmission");
    }
  });

  it("never logs in scanner server modules", () => {
    for (const moduleFile of SCANNER_SERVER_MODULES) {
      const source = read(moduleFile);
      expect(source, moduleFile).not.toContain("console.log");
      expect(source, moduleFile).not.toContain("console.error");
      expect(source, moduleFile).not.toContain("console.debug");
      expect(source, moduleFile).not.toContain("console.info");
    }
  });

  it("keeps tokens and payload prefixes out of browser components", () => {
    for (const moduleFile of SCANNER_CLIENT_MODULES) {
      const source = read(moduleFile);
      expect(source, moduleFile).not.toContain("TAE-GRAD1");
      expect(source, moduleFile).not.toContain("buildTicketToken");
      expect(source, moduleFile).not.toContain("token_hash");
    }
  });

  it("imports @zxing/browser only in the camera client component", () => {
    const cameraScanner = read("features/scanner/components/camera-scanner.tsx");
    expect(cameraScanner).toContain('"use client"');
    expect(cameraScanner).toContain("@zxing/browser");
    for (const moduleFile of SCANNER_SERVER_MODULES) {
      expect(read(moduleFile), moduleFile).not.toContain("@zxing/browser");
    }
  });

  it("shows the scanner to all staff roles in the navigation", () => {
    const shell = read("features/auth/components/staff-shell.tsx");
    expect(shell).toContain("/staff/scanner");
    expect(shell).toContain("Scan Tickets");
    const scannerLinkIndex = shell.indexOf("/staff/scanner");
    const adminBlockIndex = shell.indexOf("canAccessAdmin(session.role)");
    expect(scannerLinkIndex).toBeLessThan(adminBlockIndex);
  });

  it("marks the scanner card available on the staff home page", () => {
    const staffHome = read("app/staff/page.tsx");
    expect(staffHome).toContain("/staff/scanner");
  });

  it("keeps the scanner notice on the scanner page", () => {
    // CHECKIN-07 extends the scanner with arrival confirmation, so the
    // notice now describes scanning plus check-in rather than validation
    // only. The page still renders the shared notice constant.
    const constants = read("features/scanner/constants.ts");
    expect(constants).toContain("SCANNER_VALIDATION_ONLY_NOTICE");
    const page = read("app/staff/scanner/page.tsx");
    expect(page).toContain("SCANNER_VALIDATION_ONLY_NOTICE");
  });
});
