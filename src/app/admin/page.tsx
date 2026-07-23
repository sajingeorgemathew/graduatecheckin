import Link from "next/link";
import {
  Archive,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  Mail,
  QrCode,
  UserPlus,
  Users,
} from "lucide-react";
import { requireAdministratorPage } from "@/features/auth/guards";
import {
  ARCHIVED_AUTOMATION_LABEL,
  APPS_SCRIPT_DISTRIBUTION_ENABLED,
} from "@/features/distribution/retirement";

export const dynamic = "force-dynamic";

interface AdminCard {
  title: string;
  detail: string;
  href: string | null;
  badge: string;
  icon: React.ReactNode;
}

/**
 * The administration home follows the production workflow in order:
 *
 *   RSVP workbook -> reconcile -> registrations -> tickets and PDFs ->
 *   Manual Delivery Desk -> the administrator sends through Gmail ->
 *   the administrator records the send.
 *
 * The Google Apps Script distribution workflow is archived. It is not
 * deleted and its pages still open by direct link so historical delivery
 * records stay readable, but it is not part of the required path.
 */
const workflowCards: AdminCard[] = [
  {
    title: "1. Production import",
    detail:
      "Upload the RSVP workbook, reconcile duplicate submissions and " +
      "supplemental guest orders, then apply production registrations.",
    href: "/admin/production-import",
    badge: "Start here",
    icon: <FileSpreadsheet aria-hidden className="h-6 w-6" />,
  },
  {
    title: "2. Ticket management",
    detail:
      "Generate, preview, replace and revoke secure tickets, and export " +
      "branded PDFs as a ZIP.",
    href: "/admin/tickets",
    badge: "Available now",
    icon: <QrCode aria-hidden className="h-6 w-6" />,
  },
  {
    title: "3. Manual Delivery Desk",
    detail:
      "Copy each graduate's personalized branded email into Gmail, attach " +
      "the named PDF, send it yourself, then record the send.",
    href: "/admin/tickets/manual-delivery",
    badge: "Active send workflow",
    icon: <Mail aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Add a graduate or walk-in",
    detail:
      "Late RSVP, missing RSVP or a walk-in on the day. A walk-in can be " +
      "registered and checked in with no email and no PDF.",
    href: "/admin/registrations/new",
    badge: "Available now",
    icon: <UserPlus aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Graduate roster",
    detail:
      "The full graduating class, kept separate from event registrations " +
      "until you create a production registration.",
    href: "/admin/roster",
    badge: "Available now",
    icon: <GraduationCap aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Staff accounts",
    detail:
      "Create staff accounts, manage roles and reset temporary passwords.",
    href: "/admin/staff",
    badge: "Available now",
    icon: <Users aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Attendance dashboard",
    detail: "Live attendance, manual check-in and supervisor corrections.",
    href: "/staff/attendance",
    badge: "Available now",
    icon: <LayoutDashboard aria-hidden className="h-6 w-6" />,
  },
];

const archivedCards: AdminCard[] = [
  {
    title: "Google Apps Script distribution",
    detail:
      "The previous send-queue and results-CSV workflow. Retained for " +
      "historical audit only. No Google Sheet is required to send tickets.",
    href: APPS_SCRIPT_DISTRIBUTION_ENABLED
      ? "/admin/tickets/distribution"
      : null,
    badge: ARCHIVED_AUTOMATION_LABEL,
    icon: <Archive aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Registration import (CHECKIN-03)",
    detail:
      "The earlier row-by-row workbook importer. Superseded by the " +
      "production import, which reconciles guest orders.",
    href: "/admin/imports",
    badge: ARCHIVED_AUTOMATION_LABEL,
    icon: <Archive aria-hidden className="h-6 w-6" />,
  },
];

function CardGrid({ cards }: { cards: AdminCard[] }) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm"
        >
          <div
            className={
              card.href !== null
                ? "flex h-11 w-11 items-center justify-center rounded-full bg-navy text-gold-light"
                : "flex h-11 w-11 items-center justify-center rounded-full bg-cream text-navy/60"
            }
          >
            {card.icon}
          </div>
          <h2 className="mt-4 font-semibold text-navy">{card.title}</h2>
          <p className="mt-1 text-sm text-navy/70">{card.detail}</p>
          <div className="mt-3 flex items-center gap-3">
            <span
              className={
                card.href !== null
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
  );
}

export default async function AdminHomePage() {
  await requireAdministratorPage("/admin");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
      <h1 className="text-2xl font-bold text-navy">Administration</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy/70">
        The production workflow runs left to right: import the RSVP workbook,
        reconcile it, generate tickets and PDFs, then send each graduate
        their personalized email by hand from the Manual Delivery Desk. This
        application never sends email on your behalf.
      </p>

      <CardGrid cards={workflowCards} />

      <h2 className="mt-10 text-lg font-semibold text-navy">
        {ARCHIVED_AUTOMATION_LABEL}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-navy/70">
        Kept for historical audit. Nothing here is required for the current
        release, and no record has been deleted.
      </p>
      <CardGrid cards={archivedCards} />
    </main>
  );
}
