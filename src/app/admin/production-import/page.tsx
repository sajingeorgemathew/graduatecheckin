import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireAdministratorPage } from "@/features/auth/guards";
import { ProductionUploadForm } from "@/features/production-import/components/production-upload-form";
import { listProductionImportHistory } from "@/features/production-import/service";

export const dynamic = "force-dynamic";

export default async function ProductionImportPage() {
  const session = await requireAdministratorPage("/admin/production-import");
  const history = await listProductionImportHistory(session);

  return (
    <main className="flex flex-1 flex-col bg-cream">
      <div className="border-b-4 border-gold bg-navy px-6 py-10 text-white sm:px-10">
        <div className="mx-auto w-full max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-light">
            Toronto Academy of Education
          </p>
          <h1 className="mt-2 text-3xl font-bold">Production import</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/80">
            Upload the RSVP workbook, reconcile duplicate submissions and
            supplemental guest orders, then apply the result to production
            registrations.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-8 sm:px-10">
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-gold bg-white p-4 shadow-sm"
        >
          <ShieldCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <div>
            <p className="font-semibold text-navy">
              Repeated rows are not assumed to be duplicates
            </p>
            <p className="text-sm text-navy/75">
              A repeated row carrying a guest name, a child selection, a
              payment amount or a guest note is a supplemental guest order.
              It is preserved with its own order ID and merged into the same
              graduate&apos;s approved party. It never creates a second
              registration and never a second ticket.
            </p>
          </div>
        </div>

        <ProductionUploadForm />

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-navy">Import history</h2>
          {!history.ok || history.data.length === 0 ? (
            <p className="mt-2 text-sm text-navy/70">
              No production import has been uploaded for the active event yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {history.data.map((summary) => (
                <li
                  key={summary.importId}
                  className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-navy">
                        {summary.originalFilename}
                      </p>
                      <p className="mt-0.5 text-xs text-navy/70">
                        {summary.graduateCount} graduates ·{" "}
                        {summary.supplementalOrderCount} supplemental orders ·{" "}
                        {summary.duplicateSubmissionCount} likely duplicates ·{" "}
                        {summary.expectedTicketCount} expected tickets
                      </p>
                      <p className="mt-0.5 text-xs text-navy/60">
                        {new Date(summary.createdAt).toLocaleString("en-CA", {
                          timeZone: "America/Toronto",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-navy/5 px-3 py-1 text-xs font-semibold text-navy">
                        {summary.status}
                      </span>
                      <Link
                        href={`/admin/production-import/${summary.importId}`}
                        className="text-xs font-semibold text-navy underline"
                      >
                        Open
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-8 text-sm text-navy/60">
          <Link href="/admin" className="underline">
            Back to administration
          </Link>
        </p>
      </div>
    </main>
  );
}
