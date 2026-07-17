import Link from "next/link";
import { FileSpreadsheet, LayoutDashboard, QrCode, Users } from "lucide-react";
import { requireAdministratorPage } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

interface AdminCard {
  title: string;
  detail: string;
  href: string | null;
  badge: string;
  icon: React.ReactNode;
}

const adminCards: AdminCard[] = [
  {
    title: "Registration Imports",
    detail: "Upload, preview and apply registration workbooks.",
    href: "/admin/imports",
    badge: "Available now",
    icon: <FileSpreadsheet aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Staff Accounts",
    detail: "Create staff accounts, manage roles and reset temporary passwords.",
    href: "/admin/staff",
    badge: "Available now",
    icon: <Users aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Ticket Management",
    detail: "Generate and manage QR admission tickets.",
    href: null,
    badge: "Available in CHECKIN-05",
    icon: <QrCode aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Event Dashboard",
    detail: "Live attendance and supervisor corrections.",
    href: null,
    badge: "Available in CHECKIN-08",
    icon: <LayoutDashboard aria-hidden className="h-6 w-6" />,
  },
];

export default async function AdminHomePage() {
  await requireAdministratorPage("/admin");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
      <h1 className="text-2xl font-bold text-navy">Administration</h1>
      <p className="mt-1 text-sm text-navy/70">
        Administrator tools for the graduation check-in application.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {adminCards.map((card) => (
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
    </main>
  );
}
