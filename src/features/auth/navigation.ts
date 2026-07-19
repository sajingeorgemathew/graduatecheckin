/**
 * Staff navigation model. Deliberately free of React so the visible link
 * set and the active-route rule can be unit tested and shared by the
 * server shell and the client navigation component alike. Hidden links are
 * a usability convenience only; every destination revalidates
 * authorization server-side.
 */

import { canAccessAdmin } from "@/features/auth/permissions";
import type { StaffSession } from "@/features/auth/types";

export interface NavLink {
  href: string;
  label: string;
}

/** Attendance dashboard destination for supervisors and administrators. */
export const ATTENDANCE_DASHBOARD_PATH = "/staff/attendance";

/**
 * Builds the ordered navigation for a signed-in staff member. Every role
 * sees the staff home and the scanner. Supervisors and administrators also
 * see the attendance dashboard; administrators additionally see the admin
 * management links. Scanners never see the dashboard.
 */
export function navLinksFor(session: StaffSession): NavLink[] {
  const links: NavLink[] = [
    { href: "/staff", label: "Staff Home" },
    { href: "/staff/scanner", label: "Scan Tickets" },
  ];
  if (session.role === "supervisor" || canAccessAdmin(session.role)) {
    links.push({
      href: ATTENDANCE_DASHBOARD_PATH,
      label: "Attendance Dashboard",
    });
  }
  if (canAccessAdmin(session.role)) {
    links.push(
      { href: "/admin", label: "Admin" },
      { href: "/admin/imports", label: "Imports" },
      { href: "/admin/staff", label: "Staff Accounts" },
      { href: "/admin/tickets", label: "Ticket Management" }
    );
  }
  return links;
}

/**
 * A navigation item is active on its exact route and, except for the
 * "/staff" home root, on any nested route beneath it. This keeps the
 * Attendance Dashboard highlighted across /staff/attendance and every
 * nested attendance route while preventing the home link from matching
 * every staff page.
 */
export function isNavLinkActive(pathname: string, href: string): boolean {
  if (pathname === href) {
    return true;
  }
  if (href === "/staff") {
    return false;
  }
  return pathname.startsWith(`${href}/`);
}
