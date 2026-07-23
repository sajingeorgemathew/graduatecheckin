import Link from "next/link";

import { requireAdministratorPage } from "@/features/auth/guards";
import { DistributionWorkspace } from "@/features/distribution/components/distribution-workspace";
import { resolveProductionGateStatus } from "@/features/distribution/deployment";
import { loadDistributionAdminData } from "@/features/distribution/read-service";

/**
 * Distribution Control Centre. Administrator only: the page guard rejects
 * scanners and supervisors before any data is read. Opening this page never
 * sends email and never prepares anything. Test and production counts are
 * shown separately and never merged.
 */
export const dynamic = "force-dynamic";

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "test" | "production";
}) {
  const accent =
    tone === "test"
      ? "border-sky-300"
      : tone === "production"
        ? "border-emerald-300"
        : "border-navy/10";
  return (
    <div className={`rounded-lg border ${accent} bg-white p-4 shadow-sm`}>
      <p className="text-2xl font-bold text-navy">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-navy/60">
        {label}
      </p>
    </div>
  );
}

export default async function TicketDistributionPage() {
  await requireAdministratorPage("/admin/tickets/distribution");
  const result = await loadDistributionAdminData();
  const gate = await resolveProductionGateStatus();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">
            Distribution Control Centre
          </h1>
          {result.ok && (
            <p className="mt-1 flex items-center gap-2 text-sm text-navy/70">
              <span>
                {result.data.eventName} ({result.data.eventCode})
              </span>
              <span
                className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
                  result.data.eventIsTest
                    ? "bg-sky-100 text-sky-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {result.data.eventIsTest ? "Test event" : "Production event"}
              </span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/tickets/distribution/production"
            className="inline-block rounded-md border border-navy/20 bg-white px-4 py-2 text-center text-sm font-semibold text-navy hover:border-navy/40"
          >
            Production controls
          </Link>
          <Link
            href="/admin/tickets/distribution/runbook"
            className="inline-block rounded-md border border-navy/20 bg-white px-4 py-2 text-center text-sm font-semibold text-navy hover:border-navy/40"
          >
            Operator runbook
          </Link>
          <Link
            href="/admin/tickets/distribution/import-results"
            className="inline-block rounded-md border border-navy/20 bg-white px-4 py-2 text-center text-sm font-semibold text-navy hover:border-navy/40"
          >
            Import results
          </Link>
          <Link
            href="/admin/tickets"
            className="inline-block rounded-md border border-navy/20 bg-white px-4 py-2 text-center text-sm font-semibold text-navy hover:border-navy/40"
          >
            Back to ticket management
          </Link>
        </div>
      </div>

      <p className="mt-3 rounded-md border border-navy/10 bg-white p-3 text-sm text-navy/75">
        This application prepares and records ticket deliveries. Sending is
        performed by a Google Apps Script bound to a Google Sheet; this
        application never sends email and never connects to Gmail. A send success
        means the message was accepted, not that it reached an inbox.
      </p>

      {!result.ok ? (
        <p className="mt-6 rounded-lg border border-gold bg-white p-6 text-sm text-navy">
          {result.message}
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard
              label="Total deliveries"
              value={result.data.counts.totalDeliveries}
            />
            <SummaryCard label="Prepared" value={result.data.counts.prepared} />
            <SummaryCard
              label="Test sent"
              value={result.data.counts.testSent}
              tone="test"
            />
            <SummaryCard
              label="Test failed"
              value={result.data.counts.testFailed}
              tone="test"
            />
            <SummaryCard
              label="Production sent"
              value={result.data.counts.productionSent}
              tone="production"
            />
            <SummaryCard
              label="Production failed"
              value={result.data.counts.productionFailed}
              tone="production"
            />
            <SummaryCard label="Bounced" value={result.data.counts.bounced} />
            <SummaryCard
              label="Resend required"
              value={result.data.counts.resendRequired}
            />
            <SummaryCard label="Cancelled" value={result.data.counts.cancelled} />
            <SummaryCard
              label="Suppressed"
              value={result.data.counts.suppressed}
            />
          </div>

          <DistributionWorkspace
            sourceBatches={result.data.sourceDocumentBatches}
            batches={result.data.batches}
            resultImports={result.data.resultImports}
            distributionConfigured={result.data.distributionConfigured}
            productionAllowed={gate.productionAllowed}
            productionBlockedReason={gate.blockedReason}
          />
        </>
      )}
    </main>
  );
}
