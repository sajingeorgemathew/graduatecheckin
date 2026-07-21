import Link from "next/link";

import { requireAdministratorPage } from "@/features/auth/guards";
import { ImportResultsWorkspace } from "@/features/distribution/components/import-results-workspace";
import { loadDistributionAdminData } from "@/features/distribution/read-service";

/**
 * Apps Script results import. Administrator only. Uploading a file previews
 * it; applying appends immutable attempt history. Re-applying the same file
 * is idempotent.
 */
export const dynamic = "force-dynamic";

export default async function ImportResultsPage() {
  await requireAdministratorPage("/admin/tickets/distribution/import-results");
  const result = await loadDistributionAdminData();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 sm:px-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">Import Send Results</h1>
        <Link
          href="/admin/tickets/distribution"
          className="inline-block rounded-md border border-navy/20 bg-white px-4 py-2 text-sm font-semibold text-navy hover:border-navy/40"
        >
          Back to distribution
        </Link>
      </div>

      <p className="mt-3 rounded-md border border-navy/10 bg-white p-3 text-sm text-navy/75">
        Upload the Apps Script results CSV. A send success is recorded as{" "}
        <span className="font-semibold">sent</span>, which means the message was
        accepted for delivery — not that it reached an inbox. There is no
        delivered status.
      </p>

      {!result.ok ? (
        <p className="mt-6 rounded-lg border border-gold bg-white p-6 text-sm text-navy">
          {result.message}
        </p>
      ) : result.data.deliveryBatches.length === 0 ? (
        <p className="mt-6 rounded-lg border border-navy/10 bg-white p-6 text-sm text-navy/70">
          No delivery batches exist yet. Prepare one before importing results.
        </p>
      ) : (
        <ImportResultsWorkspace
          batches={result.data.deliveryBatches.map((batch) => ({
            id: batch.id,
            code: batch.code,
            mode: batch.mode,
            status: batch.status,
          }))}
        />
      )}
    </main>
  );
}
