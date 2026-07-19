import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Static safety coverage for the attendance route handlers. Every route must
 * authorize supervisor-level staff independently of the proxy, resolve the
 * event server-side through the service, use the private no-store response
 * helper and never log the request body. These assertions read the route
 * source and never start a server.
 */

const routes = [
  "summary/route.ts",
  "search/route.ts",
  "detail/route.ts",
  "manual-arrival/route.ts",
  "correction/route.ts",
  "reverse/route.ts",
];

function readRoute(name: string): string {
  return readFileSync(
    fileURLToPath(
      new URL(`../../app/api/staff/attendance/${name}`, import.meta.url)
    ),
    "utf8"
  );
}

describe("attendance route safety", () => {
  it("authorizes supervisor-level staff in every route", () => {
    for (const route of routes) {
      const source = readRoute(route);
      expect(source, route).toContain("requireSupervisor");
      expect(source, route).toContain("guardFailureResponse");
    }
  });

  it("uses the private no-store outcome response and force-dynamic", () => {
    for (const route of routes) {
      const source = readRoute(route);
      expect(source, route).toContain("attendanceOutcomeResponse");
      expect(source, route).toContain('dynamic = "force-dynamic"');
    }
  });

  it("never logs the request body or the parsed input", () => {
    for (const route of routes) {
      const source = readRoute(route);
      expect(source, route).not.toContain("console.log");
      expect(source, route).not.toContain("console.error");
    }
  });

  it("routes attendance writes through the atomic service functions", () => {
    expect(readRoute("manual-arrival/route.ts")).toContain(
      "recordManualArrival"
    );
    expect(readRoute("correction/route.ts")).toContain(
      "applyAttendanceCorrection"
    );
    expect(readRoute("reverse/route.ts")).toContain("reverseAttendanceEntry");
  });
});
