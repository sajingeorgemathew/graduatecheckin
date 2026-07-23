import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdministratorPage } from "@/features/auth/guards";
import { ReconciliationWorkspace } from "@/features/production-import/components/reconciliation-workspace";
import { getProductionImportDetail } from "@/features/production-import/service";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ importId: string }>;
}

export default async function ProductionImportPreviewPage({
  params,
}: PageProps) {
  const { importId } = await params;
  const session = await requireAdministratorPage(
    `/admin/production-import/${importId}`
  );

  const detail = await getProductionImportDetail(session, importId);
  if (!detail.ok) {
    if (detail.status === 404) {
      notFound();
    }
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:px-10">
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          {detail.error.error.message}
        </p>
      </main>
    );
  }

  const summary = detail.data.summary;

  return (
    <main className="flex flex-1 flex-col bg-cream">
      <div className="border-b-4 border-gold bg-navy px-6 py-8 text-white sm:px-10">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-light">
            Reconciliation preview
          </p>
          <h1 className="mt-2 text-2xl font-bold">
            {summary.originalFilename}
          </h1>
          <p className="mt-1 text-sm text-white/80">
            Worksheet {summary.worksheetName} · status {summary.status}
            {summary.appliedAt !== null &&
              ` · applied ${new Date(summary.appliedAt).toLocaleString(
                "en-CA",
                { timeZone: "America/Toronto" }
              )}`}
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
        <ReconciliationWorkspace detail={detail.data} />

        <p className="mt-8 flex gap-4 text-sm text-navy/60">
          <Link href="/admin/production-import" className="underline">
            Back to production imports
          </Link>
          <Link href="/admin/tickets/manual-delivery" className="underline">
            Manual Delivery Desk
          </Link>
        </p>
      </div>
    </main>
  );
}
