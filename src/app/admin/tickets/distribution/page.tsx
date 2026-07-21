import Link from "next/link";

import { requireAdministratorPage } from "@/features/auth/guards";
import { DistributionWorkspace } from "@/features/distribution/components/distribution-workspace";
import { loadDistributionAdminData } from "@/features/distribution/read-service";

/**
 * Ticket distribution administration. Administrator only: the page guard
 * rejects scanners and supervisors before any data is read. Opening this
 * page never sends email and never prepares anything.
 */
export const dynamic = "force-dynamic";

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm">
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

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Ticket Distribution</h1>
          {result.ok && (
            <p className="mt-1 text-sm text-navy/70">
              {result.data.eventName} ({result.data.eventCode})
              {result.data.eventIsTest ? " — test event" : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2">
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
        CHECKIN-09B prepares and records ticket deliveries. Sending is performed
        by a Google Apps Script bound to a Google Sheet; this application never
        sends email and never connects to Gmail.
      </p>

      {!result.ok ? (
        <p className="mt-6 rounded-lg border border-gold bg-white p-6 text-sm text-navy">
          {result.message}
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard label="Prepared" value={result.data.counts.prepared} />
            <SummaryCard label="Sent" value={result.data.counts.sent} />
            <SummaryCard label="Failed" value={result.data.counts.failed} />
            <SummaryCard
              label="Bounce detected"
              value={result.data.counts.bounceDetected}
            />
            <SummaryCard
              label="Resend required"
              value={result.data.counts.resendRequired}
            />
            <SummaryCard label="Resent" value={result.data.counts.resent} />
            <SummaryCard label="Cancelled" value={result.data.counts.cancelled} />
            <SummaryCard
              label="Suppressed"
              value={result.data.counts.suppressed}
            />
            <SummaryCard
              label="Test deliveries"
              value={result.data.counts.testDeliveries}
            />
            <SummaryCard
              label="Production deliveries"
              value={result.data.counts.productionDeliveries}
            />
          </div>

          <DistributionWorkspace
            sourceBatches={result.data.sourceDocumentBatches}
            deliveryBatches={result.data.deliveryBatches}
            distributionConfigured={result.data.distributionConfigured}
          />
        </>
      )}
    </main>
  );
}
