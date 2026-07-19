import Link from "next/link";
import { CalendarCheck2, FileSpreadsheet, LayoutDashboard, QrCode, ScanLine, Users } from "lucide-react";
import { ROLE_LABELS, STAFF_HOME_PATH } from "@/features/auth/constants";
import { requireStaffPage } from "@/features/auth/guards";
import { canAccessAdmin } from "@/features/auth/permissions";
import type { StaffSession } from "@/features/auth/types";

export const dynamic = "force-dynamic";

interface ToolCard {
  title: string;
  detail: string;
  badge: string;
  available: boolean;
  href: string | null;
  icon: React.ReactNode;
}

function toolCardsFor(session: StaffSession): ToolCard[] {
  const cards: ToolCard[] = [
    {
      title: "Scan and Check In",
      detail:
        "Validate tickets and record graduate and registered-party arrivals.",
      badge: "Available now",
      available: true,
      href: "/staff/scanner",
      icon: <ScanLine aria-hidden className="h-6 w-6" />,
    },
  ];
  if (session.role === "supervisor" || canAccessAdmin(session.role)) {
    cards.push({
      title: "Attendance Dashboard",
      detail:
        "Monitor arrivals, find registrations, and correct attendance records.",
      badge: "Available now",
      available: true,
      href: "/staff/attendance",
      icon: <LayoutDashboard aria-hidden className="h-6 w-6" />,
    });
  }
  if (canAccessAdmin(session.role)) {
    cards.push(
      {
        title: "Registration imports",
        detail: "Upload, preview and apply registration workbooks.",
        badge: "Available now",
        available: true,
        href: "/admin/imports",
        icon: <FileSpreadsheet aria-hidden className="h-6 w-6" />,
      },
      {
        title: "Staff accounts",
        detail: "Create staff accounts and manage roles and access.",
        badge: "Available now",
        available: true,
        href: "/admin/staff",
        icon: <Users aria-hidden className="h-6 w-6" />,
      },
      {
        title: "QR ticket generation",
        detail: "Issue secure QR admission tickets to graduates.",
        badge: "Available in CHECKIN-05",
        available: false,
        href: null,
        icon: <QrCode aria-hidden className="h-6 w-6" />,
      }
    );
  }
  return cards;
}

export default async function StaffHomePage() {
  const session = await requireStaffPage(STAFF_HOME_PATH);
  const cards = toolCardsFor(session);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
      <h1 className="text-2xl font-bold text-navy">
        Welcome, {session.displayName}
      </h1>
      <p className="mt-1 text-sm text-navy/70">
        You are signed in as {ROLE_LABELS[session.role].toLowerCase()} staff.
      </p>

      <div
        role="status"
        className="mt-6 flex items-start gap-3 rounded-lg border border-navy/10 bg-white p-4 shadow-sm"
      >
        <CalendarCheck2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
        <div>
          <p className="font-semibold text-navy">Event system status</p>
          <p className="text-sm text-navy/75">
            The system is running against the development event. No real
            student information is used or displayed.
          </p>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-navy">Your tools</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm"
          >
            <div
              className={
                card.available
                  ? "flex h-11 w-11 items-center justify-center rounded-full bg-navy text-gold-light"
                  : "flex h-11 w-11 items-center justify-center rounded-full bg-cream text-navy/60"
              }
            >
              {card.icon}
            </div>
            <h3 className="mt-4 font-semibold text-navy">{card.title}</h3>
            <p className="mt-1 text-sm text-navy/70">{card.detail}</p>
            <div className="mt-3 flex items-center gap-3">
              <span
                className={
                  card.available
                    ? "inline-block rounded-full bg-navy px-3 py-1 text-xs font-semibold text-gold-light"
                    : "inline-block rounded-full bg-navy/5 px-3 py-1 text-xs font-semibold text-navy/60"
                }
              >
                {card.badge}
              </span>
              {card.href !== null && (
                <Link
                  href={card.href}
                  className="text-xs font-semibold text-navy underline hover:text-navy-light"
                >
                  Open
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
