import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdministratorPage } from "@/features/auth/guards";
import { loadImportDetail } from "@/features/distribution/read-service";

/**
 * Result-import detail. Administrator only. Shows the file's disposition
 * summary and every evaluated source row, including rejected rows, which
 * remain visible but unapplied. Opening this page never sends email.
 */
export const dynamic = "force-dynamic";

const DISPOSITION_STYLE: Record<string, string> = {
  accepted: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  duplicate: "bg-slate-100 text-slate-700",
  rejected: "bg-rose-100 text-rose-800",
};

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const { importId } = await params;
  await requireAdministratorPage(
    `/admin/tickets/distribution/import/${importId}`
  );
  const result = await loadImportDetail(importId);
  if (!result.ok) {
    notFound();
  }
  const { import: record, lines } = result.data;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 sm:px-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">{record.fileName}</h1>
          <p className="mt-1 text-sm text-navy/70">
            Batch {record.batchCode} · {record.status} · imported by{" "}
            {record.importedBy}
          </p>
        </div>
        <Link
          href="/admin/tickets/distribution"
          className="inline-block rounded-md border border-navy/20 bg-white px-4 py-2 text-sm font-semibold text-navy hover:border-navy/40"
        >
          Back to control centre
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label="Total" value={record.totalRows} />
        <Stat label="Accepted" value={record.acceptedRows} />
        <Stat label="Duplicate" value={record.duplicateRows} />
        <Stat label="Warning" value={record.warningRows} />
        <Stat label="Rejected" value={record.rejectedRows} />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-navy">Row-level disposition</h2>
        {lines.length === 0 ? (
          <p className="mt-2 text-sm text-navy/70">
            Row-level detail is not recorded for this import.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-navy/15 text-xs uppercase tracking-wide text-navy/60">
                  <th scope="col" className="px-3 py-2">Row</th>
                  <th scope="col" className="px-3 py-2">Delivery ref</th>
                  <th scope="col" className="px-3 py-2">Attempt ref</th>
                  <th scope="col" className="px-3 py-2">Disposition</th>
                  <th scope="col" className="px-3 py-2">Mode</th>
                  <th scope="col" className="px-3 py-2">Outcome</th>
                  <th scope="col" className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr
                    key={`${line.rowNumber}-${line.attemptReference}`}
                    className="border-b border-navy/10"
                  >
                    <td className="px-3 py-2 text-navy/70">{line.rowNumber}</td>
                    <td className="px-3 py-2 font-mono text-xs text-navy">
                      {line.deliveryReference || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-navy">
                      {line.attemptReference || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${
                          DISPOSITION_STYLE[line.disposition] ??
                          "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {line.disposition}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-navy/80">{line.mode}</td>
                    <td className="px-3 py-2 text-navy/80">{line.outcome}</td>
                    <td className="px-3 py-2 text-xs text-navy/70">
                      {line.reason || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
