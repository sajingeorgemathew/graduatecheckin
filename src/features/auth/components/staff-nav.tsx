"use client";

/**
 * Client staff navigation. Renders the role-filtered link set from
 * navLinksFor and highlights the active item using the current pathname.
 * On narrow (mobile) viewports the row scrolls horizontally so every link,
 * including the Attendance Dashboard, stays reachable; on larger (desktop)
 * viewports the links wrap onto a single tidy row.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavLinkActive, type NavLink } from "@/features/auth/navigation";

const LINK_BASE =
  "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap";
const LINK_INACTIVE = "text-white/85 hover:bg-navy-light hover:text-gold-light";
const LINK_ACTIVE = "bg-navy-light text-gold-light";

export function StaffNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Staff navigation"
      className="border-t border-white/10 bg-navy-dark"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-nowrap gap-1 overflow-x-auto px-6 py-2 sm:flex-wrap sm:overflow-visible sm:px-10">
        {links.map((link) => {
          const active = isNavLinkActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`${LINK_BASE} ${active ? LINK_ACTIVE : LINK_INACTIVE}`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
