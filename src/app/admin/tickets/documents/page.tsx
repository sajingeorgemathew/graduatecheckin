import Link from "next/link";

import { requireAdministratorPage } from "@/features/auth/guards";
import { DocumentFilters } from "@/features/ticket-documents/components/document-filters";
import { DocumentWorkspace } from "@/features/ticket-documents/components/document-workspace";
import { loadTicketDocumentAdminData } from "@/features/ticket-documents/read-service";
import { documentListFilterSchema } from "@/features/ticket-documents/schemas";

/**
 * Branded PDF ticket administration. Administrator only: the page guard
 * rejects scanners and supervisors before any data is read.
 *
 * Opening this page never generates, regenerates or exports anything.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
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

export default async function TicketDocumentsPage({ searchParams }: PageProps) {
  const session = await requireAdministratorPage("/admin/tickets/documents");
  const params = await searchParams;
  const filter = documentListFilterSchema.parse(params.filter ?? "all");

  const result = await loadTicketDocumentAdminData(session, filter);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">PDF Ticket Documents</h1>
          {result.ok && (
            <p className="mt-1 text-sm text-navy/70">{result.data.eventName}</p>
          )}
        </div>
        <Link
          href="/admin/tickets"
          className="inline-block rounded-md border border-navy/20 bg-white px-4 py-2 text-center text-sm font-semibold text-navy hover:border-navy/40"
        >
          Back to ticket management
        </Link>
      </div>

      <p className="mt-3 rounded-md border border-navy/10 bg-white p-3 text-sm text-navy/75">
        CHECKIN-09A prepares and packages branded PDF tickets. It does not send
        email; distribution is handled separately.
      </p>

      {!result.ok ? (
        <p className="mt-6 rounded-lg border border-gold bg-white p-6 text-sm text-navy">
          {result.error.error.message}
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryCard
              label="Eligible active tickets"
              value={result.data.summary.eligibleActiveTickets}
            />
            <SummaryCard label="Missing PDF" value={result.data.summary.missingPdf} />
            <SummaryCard label="Current PDF" value={result.data.summary.currentPdf} />
            <SummaryCard label="Outdated PDF" value={result.data.summary.outdatedPdf} />
            <SummaryCard
              label="Superseded PDF"
              value={result.data.summary.supersededPdf}
            />
            <SummaryCard
              label="Invalidated PDF"
              value={result.data.summary.invalidatedPdf}
            />
            <SummaryCard
              label="Generation failed"
              value={result.data.summary.generationFailed}
            />
            <SummaryCard
              label="Ready for export"
              value={result.data.summary.readyForExport}
            />
            <SummaryCard
              label="In an export batch"
              value={result.data.summary.alreadyInExportBatch}
            />
            <SummaryCard
              label="Missing recipient email"
              value={result.data.summary.missingRecipientEmail}
            />
            <SummaryCard
              label="Test registrations"
              value={result.data.summary.testRegistrations}
            />
            <SummaryCard
              label="Production registrations"
              value={result.data.summary.productionRegistrations}
            />
          </div>

          <div className="mt-6">
            <DocumentFilters filter={result.data.filter} />
          </div>

          <DocumentWorkspace rows={result.data.rows} />

          <section className="mt-10">
            <h2 className="text-lg font-bold text-navy">Export batches</h2>
            {result.data.batches.length === 0 ? (
              <p className="mt-2 text-sm text-navy/70">
                No export batches have been created yet.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-navy/15 text-xs uppercase tracking-wide text-navy/60">
                      <th scope="col" className="px-3 py-2">Batch code</th>
                      <th scope="col" className="px-3 py-2">Status</th>
                      <th scope="col" className="px-3 py-2">Purpose</th>
                      <th scope="col" className="px-3 py-2">Ready</th>
                      <th scope="col" className="px-3 py-2">Excluded</th>
                      <th scope="col" className="px-3 py-2">Created</th>
                      <th scope="col" className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.batches.map((batch) => (
                      <tr key={batch.batchId} className="border-b border-navy/10">
                        <td className="px-3 py-2 font-mono text-xs text-navy">
                          {batch.batchCode}
                        </td>
                        <td className="px-3 py-2 text-navy/80">{batch.status}</td>
                        <td className="px-3 py-2 text-navy/80">{batch.purpose}</td>
                        <td className="px-3 py-2 text-navy/80">{batch.readyCount}</td>
                        <td className="px-3 py-2 text-navy/80">
                          {batch.excludedCount}
                        </td>
                        <td className="px-3 py-2 text-navy/70">
                          {new Date(batch.createdAt).toLocaleString("en-CA")}
                        </td>
                        <td className="px-3 py-2">
                          <a
                            href={`/api/admin/ticket-documents/batches/${batch.batchId}/download`}
                            className="rounded border border-navy/20 px-2 py-1 text-xs font-semibold text-navy"
                          >
                            Download ZIP
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
