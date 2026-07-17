import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Static authorization audit. Every protected route handler and page must
 * perform its own server-side guard call, so the Proxy is never the only
 * authorization layer.
 */

const appDir = fileURLToPath(new URL("../../app", import.meta.url));
const srcDir = fileURLToPath(new URL("../..", import.meta.url));

function collectFiles(dir: string, suffix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      found.push(...collectFiles(fullPath, suffix));
    } else if (fullPath.endsWith(suffix)) {
      found.push(fullPath);
    }
  }
  return found;
}

describe("route authorization coverage", () => {
  it("guards every admin API route handler independently", () => {
    const routes = collectFiles(join(appDir, "api", "admin"), "route.ts");
    // Imports upload, apply, cancel, row toggle plus staff create, role,
    // status and reset-password.
    expect(routes.length).toBeGreaterThanOrEqual(8);
    for (const route of routes) {
      const source = readFileSync(route, "utf8");
      expect(source, route).toContain("requireAdministrator");
      expect(source, route).toContain("guardFailureResponse");
    }
  });

  it("guards every admin page independently of the layout and proxy", () => {
    const pages = collectFiles(join(appDir, "admin"), "page.tsx");
    expect(pages.length).toBeGreaterThanOrEqual(5);
    for (const page of pages) {
      const source = readFileSync(page, "utf8");
      expect(source, page).toContain("requireAdministratorPage");
    }
  });

  it("guards the staff pages independently", () => {
    const staffHome = readFileSync(join(appDir, "staff", "page.tsx"), "utf8");
    expect(staffHome).toContain("requireStaffPage");
    const changePassword = readFileSync(
      join(appDir, "staff", "change-password", "page.tsx"),
      "utf8"
    );
    expect(changePassword).toContain("requireStaffPage");
  });

  it("keeps the proxy as a refresh and redirect layer only", () => {
    const proxy = readFileSync(join(srcDir, "proxy.ts"), "utf8");
    // The proxy refreshes cookies and redirects; it never queries
    // registration data or staff profiles.
    expect(proxy).toContain("getUser");
    expect(proxy).not.toContain("graduation_registrations");
    expect(proxy).not.toContain("staff_profiles");
    expect(proxy).not.toContain("service_role");
    expect(proxy).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("keeps signup routes absent", () => {
    const appEntries = readdirSync(appDir);
    expect(appEntries).not.toContain("signup");
    expect(appEntries).not.toContain("register");
  });
});
