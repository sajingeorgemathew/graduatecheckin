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

/** The active ticket-sending workflow for administrators. */
export const MANUAL_DELIVERY_PATH = "/admin/tickets/manual-delivery";

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
    // The order mirrors the production workflow: import the RSVP workbook,
    // generate tickets, then send them by hand from the delivery desk. The
    // archived Google Apps Script distribution pages are deliberately
    // absent; they remain reachable by direct link for audit only.
    links.push(
      { href: "/admin", label: "Admin" },
      { href: "/admin/production-import", label: "Production Import" },
      { href: "/admin/tickets", label: "Ticket Management" },
      {
        href: MANUAL_DELIVERY_PATH,
        label: "Manual Delivery",
      },
      { href: "/admin/staff", label: "Staff Accounts" }
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
