import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { evaluateRoleGuard } from "@/features/auth/guards";
import type { SessionResolution } from "@/features/auth/types";
import { canUseScanner } from "@/features/scanner/permissions";
import { validateScan } from "@/features/scanner/service";
import {
  fakeScannerWorld,
  fictionalScannerSession,
  fictionalTicket,
  payloadForTicket,
  scanRequest,
} from "./helpers";

const srcDir = fileURLToPath(new URL("../..", import.meta.url));

function activeResolution(
  role: "scanner" | "supervisor" | "administrator",
  overrides: Partial<{ isActive: boolean; mustChangePassword: boolean }> = {}
): SessionResolution {
  return {
    kind: "active",
    session: fictionalScannerSession(role, overrides),
  };
}

describe("scanner authorization", () => {
  it("denies anonymous callers", () => {
    const guard = evaluateRoleGuard({ kind: "anonymous" }, "scanner");
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.status).toBe(401);
    }
  });

  it("denies callers without a staff profile", () => {
    const guard = evaluateRoleGuard(
      { kind: "no_profile", userId: "u" },
      "scanner"
    );
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.code).toBe("account_inactive");
    }
  });

  it("denies inactive staff", () => {
    const guard = evaluateRoleGuard(
      { kind: "inactive", userId: "u" },
      "scanner"
    );
    expect(guard.ok).toBe(false);
  });

  it("denies staff who still must change their password", () => {
    const guard = evaluateRoleGuard(
      activeResolution("scanner", { mustChangePassword: true }),
      "scanner"
    );
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.code).toBe("password_change_required");
    }
  });

  it("allows scanner, supervisor and administrator roles", () => {
    for (const role of ["scanner", "supervisor", "administrator"] as const) {
      const guard = evaluateRoleGuard(activeResolution(role), "scanner");
      expect(guard.ok, role).toBe(true);
      expect(canUseScanner(role), role).toBe(true);
    }
  });

  it("re-checks the session inside the service as defense in depth", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);

    const outcome = await validateScan(
      world.deps,
      fictionalScannerSession("scanner", { isActive: false }),
      scanRequest("qr", payloadForTicket(ticket))
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(403);
    }
    expect(world.attempts).toHaveLength(0);
  });

  it("guards the validation route independently of the proxy", () => {
    const route = readFileSync(
      join(srcDir, "app", "api", "staff", "scanner", "validate", "route.ts"),
      "utf8"
    );
    expect(route).toContain("requireScanner");
    expect(route).toContain("guardFailureResponse");
  });

  it("guards the scanner page server-side", () => {
    const page = readFileSync(
      join(srcDir, "app", "staff", "scanner", "page.tsx"),
      "utf8"
    );
    expect(page).toContain("requireStaffPage");
    expect(page).toContain("SCANNER_PAGE_PATH");
  });
});
