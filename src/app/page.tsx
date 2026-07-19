import {
  CheckCircle2,
  Database,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  QrCode,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

interface StatusCard {
  title: string;
  detail: string;
  done: boolean;
  badge: string;
  icon: React.ReactNode;
}

const statusCards: StatusCard[] = [
  {
    title: "Application configured",
    detail: "Next.js, TypeScript, Tailwind CSS and testing are set up.",
    done: true,
    badge: "Complete",
    icon: <CheckCircle2 aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Database migration deployed",
    detail: "The check-in schema migration is deployed to the Supabase project.",
    done: true,
    badge: "Complete",
    icon: <Database aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Mock data loaded",
    detail: "Fictional development records are seeded with protected reset commands.",
    done: true,
    badge: "Complete",
    icon: <QrCode aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Supabase project connected",
    detail: "The application is connected to the hosted Supabase project.",
    done: true,
    badge: "Complete",
    icon: <KeyRound aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Excel import workflow",
    detail:
      "Registration workbooks can be uploaded, previewed and safely applied by authenticated administrators.",
    done: true,
    badge: "Administrator protected",
    icon: <FileSpreadsheet aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Staff authentication",
    detail:
      "Staff sign in with email and password. Roles control access to scanning, supervision and administration tools.",
    done: true,
    badge: "Complete",
    icon: <ShieldCheck aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Secure ticket generation",
    detail:
      "Administrators generate, replace and revoke secure QR admission tickets.",
    done: true,
    badge: "Complete",
    icon: <QrCode aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Mobile ticket scanner",
    detail:
      "Staff validate graduate QR tickets and ticket codes at the entrance.",
    done: true,
    badge: "Complete",
    icon: <ScanLine aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Graduate and guest check-in",
    detail:
      "Staff confirm who is arriving after a valid scan. Attendance is " +
      "recorded against the registration.",
    done: true,
    badge: "Ready for protected testing",
    icon: <CheckCircle2 aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Attendance dashboard and corrections",
    detail:
      "Supervisors monitor arrivals, search registrations and correct " +
      "attendance with an append-only audit history.",
    done: true,
    badge: "Ready for protected testing",
    icon: <LayoutDashboard aria-hidden className="h-6 w-6" />,
  },
  {
    title: "Ticket PDF and email",
    detail: "Ticket document generation and email delivery arrive later.",
    done: false,
    badge: "Not implemented",
    icon: <QrCode aria-hidden className="h-6 w-6" />,
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-cream">
      <div className="border-b-4 border-gold bg-navy px-6 py-12 text-white sm:px-10 sm:py-16">
        <div className="mx-auto w-full max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-light">
            Toronto Academy of Education
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Graduation Check-In
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/85 sm:text-lg">
            Secure ticket management and fast event check-in for graduates and
            registered guests.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10 sm:px-10">
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-gold bg-white p-4 shadow-sm"
        >
          <TriangleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <div>
            <p className="font-semibold text-navy">Development mode</p>
            <p className="text-sm text-navy/75">
              This application is under active development. No real student
              information is used or displayed.
            </p>
          </div>
        </div>

        <h2 className="mt-10 text-xl font-semibold text-navy">
          Development status
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statusCards.map((card) => (
            <div
              key={card.title}
              className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm"
            >
              <div
                className={
                  card.done
                    ? "flex h-11 w-11 items-center justify-center rounded-full bg-navy text-gold-light"
                    : "flex h-11 w-11 items-center justify-center rounded-full bg-cream text-navy/60"
                }
              >
                {card.icon}
              </div>
              <h3 className="mt-4 font-semibold text-navy">{card.title}</h3>
              <p className="mt-1 text-sm text-navy/70">{card.detail}</p>
              <span
                className={
                  card.done
                    ? "mt-3 inline-block rounded-full bg-navy px-3 py-1 text-xs font-semibold text-gold-light"
                    : "mt-3 inline-block rounded-full bg-navy/5 px-3 py-1 text-xs font-semibold text-navy/60"
                }
              >
                {card.badge}
              </span>
            </div>
          ))}
        </div>
      </div>

      <footer className="border-t border-navy/10 bg-white px-6 py-6 sm:px-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 text-sm text-navy/70 sm:flex-row sm:items-center sm:justify-between">
          <span>Toronto Academy of Education</span>
          <span>Graduation Check-In, development build</span>
        </div>
      </footer>
    </main>
  );
}
