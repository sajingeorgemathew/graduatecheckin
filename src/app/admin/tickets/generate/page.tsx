import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireAdministratorPage } from "@/features/auth/guards";
import { GenerationPreviewForm } from "@/features/tickets/components/generation-preview";
import { getGenerationPreview } from "@/features/tickets/service";

export const dynamic = "force-dynamic";

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm">
      <p className="text-2xl font-bold text-navy">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-navy/60">
        {label}
      </p>
    </div>
  );
}

export default async function GenerateTicketsPage() {
  const session = await requireAdministratorPage("/admin/tickets/generate");
  const result = await getGenerationPreview(session);

  // Generated server-side per page load so a double submission of the
  // same form returns the same batch instead of generating twice.
  const idempotencyKey = randomUUID();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-navy">Generate tickets</h1>
        <Link
          href="/admin/tickets"
          className="text-sm font-semibold text-navy underline hover:text-navy-light"
        >
          Return to Ticket Management
        </Link>
      </div>

      {!result.ok ? (
        <p className="mt-6 rounded-lg border border-gold bg-white p-6 text-sm text-navy">
          {result.error.error.message}
        </p>
      ) : (
        <>
          <div className="mt-4 rounded-lg border border-navy/10 bg-white p-4 shadow-sm">
            <p className="text-sm text-navy/70">Active event</p>
            <p className="font-semibold text-navy">
              {result.data.eventName}{" "}
              <span className="font-mono text-sm text-navy/70">
                ({result.data.eventCode})
              </span>
            </p>
            <span
              className={
                result.data.eventIsTest
                  ? "mt-2 inline-block rounded-full bg-gold-light px-3 py-1 text-xs font-semibold text-navy"
                  : "mt-2 inline-block rounded-full bg-navy px-3 py-1 text-xs font-semibold text-gold-light"
              }
            >
              {result.data.eventIsTest ? "Test event" : "Production event"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <CountCard
              label="Eligible without tickets"
              value={result.data.candidates.length}
            />
            <CountCard
              label="Already hold active tickets"
              value={result.data.alreadyTicketedCount}
            />
            <CountCard label="Failed" value={result.data.failedCount} />
            <CountCard label="Cancelled" value={result.data.cancelledCount} />
            <CountCard
              label="Review required"
              value={result.data.reviewRequiredCount}
            />
          </div>

          <GenerationPreviewForm
            candidates={result.data.candidates}
            idempotencyKey={idempotencyKey}
          />
        </>
      )}
    </main>
  );
}
