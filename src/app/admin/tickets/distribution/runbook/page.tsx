import Link from "next/link";

import { requireAdministratorPage } from "@/features/auth/guards";
import { resolveProductionGateStatus } from "@/features/distribution/deployment";
import { RUNBOOK_SECTIONS } from "@/features/distribution/runbook-content";

/**
 * CHECKIN-10A administrator runbook.
 *
 * Written for a nontechnical administrator: every step is something a person
 * can do from a browser and a Google Sheet. It contains no secret, no token
 * and no graduate data, and it never triggers an action itself — it is a
 * reference page. Administrator only.
 */
export const dynamic = "force-dynamic";

export default async function DistributionRunbookPage() {
  await requireAdministratorPage("/admin/tickets/distribution/runbook");
  const gate = await resolveProductionGateStatus();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8 sm:px-10">
      <Link
        href="/admin/tickets/distribution"
        className="text-sm font-semibold text-navy/70 hover:text-navy"
      >
        ← Ticket distribution
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-navy">
        Ticket distribution operator runbook
      </h1>
      <p className="mt-2 text-sm text-navy/70">
        Follow these steps in order. Every step can be done from a browser. If a
        step is refused, that is the system protecting a graduate — read the
        message and stop rather than working around it.
      </p>
      <p className="mt-3 rounded-md border border-navy/15 bg-white p-3 text-sm text-navy">
        This deployment is <strong>{gate.deploymentLabel}</strong> and the active
        event is <strong>{gate.eventLabel}</strong> ({gate.activeEventCode ||
          "not configured"}).{" "}
        {gate.productionAllowed
          ? "Production sending controls are available here."
          : "Production sending controls are disabled here."}
      </p>

      <nav className="mt-6 rounded-lg border border-navy/10 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-navy/60">
          Contents
        </h2>
        <ol className="mt-2 grid gap-1 text-sm text-navy sm:grid-cols-2">
          {RUNBOOK_SECTIONS.map((section, index) => (
            <li key={section.title}>
              <a
                href={`#section-${index + 1}`}
                className="hover:underline"
              >
                {index + 1}. {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 flex flex-col gap-6">
        {RUNBOOK_SECTIONS.map((section, index) => (
          <section
            key={section.title}
            id={`section-${index + 1}`}
            className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-bold text-navy">
              {index + 1}. {section.title}
            </h2>
            {section.intro && (
              <p className="mt-1 text-sm text-navy/70">{section.intro}</p>
            )}
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-navy/90">
              {section.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {section.warning && (
              <p className="mt-3 rounded-md border border-gold bg-gold/10 p-3 text-sm font-semibold text-navy">
                {section.warning}
              </p>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
