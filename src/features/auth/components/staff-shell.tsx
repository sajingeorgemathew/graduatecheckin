/**
 * Protected application shell. Shows the signed-in staff member, their
 * role badge and only the navigation their role permits. Hidden links are
 * a usability feature only; every destination revalidates authorization
 * server-side.
 */

import Link from "next/link";
import { ROLE_LABELS } from "@/features/auth/constants";
import { canAccessAdmin } from "@/features/auth/permissions";
import type { StaffSession } from "@/features/auth/types";

interface StaffShellProps {
  session: StaffSession;
  children: React.ReactNode;
}

interface NavLink {
  href: string;
  label: string;
}

function navLinksFor(session: StaffSession): NavLink[] {
  const links: NavLink[] = [{ href: "/staff", label: "Staff Home" }];
  if (canAccessAdmin(session.role)) {
    links.push(
      { href: "/admin", label: "Admin" },
      { href: "/admin/imports", label: "Imports" },
      { href: "/admin/staff", label: "Staff Accounts" }
    );
  }
  return links;
}

export function StaffShell({ session, children }: StaffShellProps) {
  const links = navLinksFor(session);

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="border-b-4 border-gold bg-navy text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gold-light">
              Toronto Academy of Education
            </p>
            <p className="text-lg font-bold">Graduation Check-In</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold">{session.displayName}</span>
            <span className="rounded-full bg-gold-light px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-navy">
              {ROLE_LABELS[session.role]}
            </span>
            <Link
              href="/staff/change-password"
              className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-semibold hover:bg-navy-light"
            >
              Change Password
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md bg-gold px-3 py-1.5 text-xs font-semibold text-navy hover:bg-gold-light"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
        <nav
          aria-label="Staff navigation"
          className="border-t border-white/10 bg-navy-dark"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-1 px-6 py-2 sm:px-10">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-1.5 text-sm font-semibold text-white/85 hover:bg-navy-light hover:text-gold-light"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
