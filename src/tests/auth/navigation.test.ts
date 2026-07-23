import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ATTENDANCE_DASHBOARD_PATH,
  isNavLinkActive,
  MANUAL_DELIVERY_PATH,
  navLinksFor,
} from "@/features/auth/navigation";
import { fictionalSession } from "./helpers";

const srcDir = fileURLToPath(new URL("../..", import.meta.url));

function read(relative: string): string {
  return readFileSync(join(srcDir, ...relative.split("/")), "utf8");
}

function labels(role: "scanner" | "supervisor" | "administrator"): string[] {
  return navLinksFor(fictionalSession(role)).map((link) => link.label);
}

describe("staff navigation link set", () => {
  it("gives every role the staff home and scanner links", () => {
    for (const role of ["scanner", "supervisor", "administrator"] as const) {
      expect(labels(role)).toEqual(
        expect.arrayContaining(["Staff Home", "Scan Tickets"])
      );
    }
  });

  it("shows the Attendance Dashboard to supervisors and administrators", () => {
    for (const role of ["supervisor", "administrator"] as const) {
      const links = navLinksFor(fictionalSession(role));
      const dashboard = links.find(
        (link) => link.label === "Attendance Dashboard"
      );
      expect(dashboard).toBeDefined();
      expect(dashboard?.href).toBe(ATTENDANCE_DASHBOARD_PATH);
      expect(dashboard?.href).toBe("/staff/attendance");
    }
  });

  it("hides the Attendance Dashboard from scanners", () => {
    expect(labels("scanner")).not.toContain("Attendance Dashboard");
  });

  it("keeps administrator-only management links for administrators only", () => {
    const adminLabels = labels("administrator");
    expect(adminLabels).toEqual(
      expect.arrayContaining([
        "Admin",
        "Production Import",
        "Manual Delivery",
        "Staff Accounts",
        "Ticket Management",
      ])
    );
    for (const label of [
      "Production Import",
      "Manual Delivery",
      "Staff Accounts",
      "Ticket Management",
    ]) {
      expect(labels("supervisor")).not.toContain(label);
      expect(labels("scanner")).not.toContain(label);
    }
  });

  it("keeps the archived Apps Script distribution out of the navigation", () => {
    // CHECKIN-10B retired the Google Apps Script workflow from the required
    // production path. Its pages still open by direct link for audit, but
    // they are no longer an entry point an administrator can wander into.
    for (const link of navLinksFor(fictionalSession("administrator"))) {
      expect(link.href).not.toContain("/distribution");
      expect(link.label.toLowerCase()).not.toContain("distribution");
    }
  });

  it("points administrators at the Manual Delivery Desk", () => {
    const links = navLinksFor(fictionalSession("administrator"));
    const delivery = links.find((link) => link.label === "Manual Delivery");
    expect(delivery?.href).toBe(MANUAL_DELIVERY_PATH);
    expect(delivery?.href).toBe("/admin/tickets/manual-delivery");
  });
});

describe("navigation active-route rule", () => {
  it("marks the Attendance Dashboard active on its exact route", () => {
    expect(isNavLinkActive("/staff/attendance", "/staff/attendance")).toBe(true);
  });

  it("marks the Attendance Dashboard active on nested attendance routes", () => {
    expect(
      isNavLinkActive("/staff/attendance/registrations", "/staff/attendance")
    ).toBe(true);
    expect(
      isNavLinkActive("/staff/attendance/corrections/42", "/staff/attendance")
    ).toBe(true);
  });

  it("does not activate the dashboard on unrelated staff routes", () => {
    expect(isNavLinkActive("/staff/scanner", "/staff/attendance")).toBe(false);
    expect(isNavLinkActive("/staff", "/staff/attendance")).toBe(false);
  });

  it("activates the staff home only on its exact route", () => {
    expect(isNavLinkActive("/staff", "/staff")).toBe(true);
    expect(isNavLinkActive("/staff/attendance", "/staff")).toBe(false);
    expect(isNavLinkActive("/staff/scanner", "/staff")).toBe(false);
  });
});

describe("staff home dashboard card", () => {
  const staffHome = read("app/staff/page.tsx");

  it("links the Attendance Dashboard card to /staff/attendance", () => {
    expect(staffHome).toContain("Attendance Dashboard");
    expect(staffHome).toContain("/staff/attendance");
  });

  it("restricts the dashboard card to supervisors and administrators", () => {
    expect(staffHome).toContain(
      'session.role === "supervisor" || canAccessAdmin(session.role)'
    );
  });
});
