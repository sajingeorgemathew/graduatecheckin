import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdministratorPage } from "@/features/auth/guards";
import { BatchDetailWorkspace } from "@/features/distribution/components/batch-detail-workspace";
import { loadBatchDetail } from "@/features/distribution/read-service";

/**
 * Delivery batch detail. Administrator only. Shows batch and event identity, a
 * test/production warning banner, separated counts, every delivery with its
 * latest test and production outcome, full attempt history and the batch's
 * result-import history. Opening this page never sends email.
 */
export const dynamic = "force-dynamic";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchCode: string }>;
}) {
  const { batchCode } = await params;
  await requireAdministratorPage(`/admin/tickets/distribution/${batchCode}`);
  const result = await loadBatchDetail(batchCode);
  if (!result.ok) {
    notFound();
  }
  const data = result.data;
  const isTest = data.mode === "test";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-bold text-navy">
            {data.batchCode}
          </h1>
          <p className="mt-1 text-sm text-navy/70">
            {data.eventTitle} ({data.eventCode}) · {data.purpose} · {data.status}
          </p>
          <p className="mt-1 text-xs text-navy/60">
            Created by {data.createdBy} · {new Date(data.createdAt).toLocaleString()}
          </p>
        </div>
        <Link
          href="/admin/tickets/distribution"
          className="inline-block rounded-md border border-navy/20 bg-white px-4 py-2 text-center text-sm font-semibold text-navy hover:border-navy/40"
        >
          Back to control centre
        </Link>
      </div>

      <div
        className={`mt-4 rounded-lg border p-4 text-sm font-semibold ${
          isTest
            ? "border-sky-300 bg-sky-50 text-sky-900"
            : "border-emerald-300 bg-emerald-50 text-emerald-900"
        }`}
      >
        {isTest
          ? "TEST BATCH — attempts are delivered to the internal test inbox only. Production sent timestamps stay blank."
          : "PRODUCTION BATCH — attempts are delivered to each graduate's real intended recipient."}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        <Stat label="Total" value={data.counts.totalDeliveries} />
        <Stat label="Prepared" value={data.counts.prepared} />
        <Stat label="Test sent" value={data.counts.testSent} />
        <Stat label="Test failed" value={data.counts.testFailed} />
        <Stat label="Production sent" value={data.counts.productionSent} />
        <Stat label="Production failed" value={data.counts.productionFailed} />
        <Stat label="Bounced" value={data.counts.bounced} />
        <Stat label="Resend required" value={data.counts.resendRequired} />
        <Stat label="Cancelled" value={data.counts.cancelled} />
        <Stat label="Suppressed" value={data.counts.suppressed} />
      </div>

      <BatchDetailWorkspace
        deliveries={data.deliveries}
        resultImports={data.resultImports}
      />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-navy/10 bg-white p-3 shadow-sm">
      <p className="text-xl font-bold text-navy">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-navy/60">
        {label}
      </p>
    </div>
  );
}
