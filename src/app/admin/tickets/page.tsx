import Link from "next/link";
import { requireAdministratorPage } from "@/features/auth/guards";
import { TicketFilters } from "@/features/tickets/components/ticket-filters";
import { TicketList } from "@/features/tickets/components/ticket-list";
import {
  getBatchSummary,
  getTicketManagementData,
  type BatchSummary,
} from "@/features/tickets/service";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    filter?: string;
    search?: string;
    page?: string;
    batch?: string;
  }>;
}

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

function BatchBanner({ batch }: { batch: BatchSummary }) {
  return (
    <div
      role="status"
      className="mt-4 rounded-lg border border-gold bg-white p-4 shadow-sm"
    >
      <p className="font-semibold text-navy">Ticket generation finished</p>
      <p className="mt-1 text-sm text-navy/75">
        {batch.generatedCount} generated, {batch.skippedCount} skipped
        {batch.errorCount > 0 ? `, ${batch.errorCount} errors` : ""} out of{" "}
        {batch.candidateCount} selected registrations.
      </p>
    </div>
  );
}

export default async function TicketManagementPage({ searchParams }: PageProps) {
  const session = await requireAdministratorPage("/admin/tickets");
  const params = await searchParams;

  const result = await getTicketManagementData(
    session,
    params.filter,
    params.search,
    params.page
  );

  const batchResult =
    params.batch !== undefined
      ? await getBatchSummary(session, params.batch)
      : null;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Ticket Management</h1>
          {result.ok && (
            <p className="mt-1 text-sm text-navy/70">
              {result.data.eventName}
              {result.data.eventIsTest ? " (test event)" : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/tickets/documents"
            className="inline-block rounded-md border border-navy/20 bg-white px-4 py-2 text-center text-sm font-semibold text-navy shadow-sm hover:border-navy/40"
          >
            PDF ticket documents
          </Link>
          <Link
            href="/admin/tickets/manual-delivery"
            className="inline-block rounded-md border border-navy/20 bg-white px-4 py-2 text-center text-sm font-semibold text-navy shadow-sm hover:border-navy/40"
          >
            Manual Delivery Desk
          </Link>
          <Link
            href="/admin/tickets/generate"
            className="inline-block rounded-md bg-navy px-4 py-2 text-center text-sm font-semibold text-gold-light shadow-sm hover:bg-navy-light"
          >
            Generate tickets
          </Link>
        </div>
      </div>

      {batchResult !== null && batchResult.ok && (
        <BatchBanner batch={batchResult.data} />
      )}

      {!result.ok ? (
        <p className="mt-6 rounded-lg border border-gold bg-white p-6 text-sm text-navy">
          {result.error.error.message}
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryCard
              label="Eligible registrations"
              value={result.data.summary.eligibleRegistrations}
            />
            <SummaryCard
              label="Active tickets"
              value={result.data.summary.activeTickets}
            />
            <SummaryCard
              label="Eligible without tickets"
              value={result.data.summary.eligibleWithoutTickets}
            />
            <SummaryCard
              label="Revoked tickets"
              value={result.data.summary.revokedTickets}
            />
            <SummaryCard
              label="Replaced tickets"
              value={result.data.summary.replacedTickets}
            />
            <SummaryCard
              label="Blocked registrations"
              value={result.data.summary.blockedRegistrations}
            />
          </div>

          <div className="mt-6">
            <TicketFilters
              filter={result.data.filter}
              search={result.data.search}
            />
          </div>

          <TicketList
            list={result.data.list}
            filter={result.data.filter}
            search={result.data.search}
          />
        </>
      )}
    </main>
  );
}
