import Link from "next/link";
import { notFound } from "next/navigation";
import { hasImportAccess } from "@/features/imports/access";
import { ImportsDisabledNotice } from "@/features/imports/components/disabled-notice";
import { ImportPreview } from "@/features/imports/components/import-preview";
import { importIdSchema } from "@/features/imports/schemas";
import { getImportDetail } from "@/features/imports/service";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ importId: string }>;
}

export default async function ImportDetailPage({ params }: PageProps) {
  if (!hasImportAccess()) {
    return <ImportsDisabledNotice />;
  }

  const { importId } = await params;
  const parsedImportId = importIdSchema.safeParse(importId);
  if (!parsedImportId.success) {
    notFound();
  }

  const result = await getImportDetail(parsedImportId.data);
  if (!result.ok) {
    notFound();
  }

  const { importRecord, rows, missing } = result.data;

  return (
    <main className="flex min-h-screen flex-col bg-cream">
      <div className="border-b-4 border-gold bg-navy px-6 py-10 text-white sm:px-10">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-light">
            Toronto Academy of Education
          </p>
          <h1 className="mt-2 text-3xl font-bold">Import preview</h1>
          <p className="mt-2 text-sm text-white/85">
            {importRecord.original_filename} - worksheet{" "}
            {importRecord.worksheet_name} - status {importRecord.status}
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
        <p className="mb-4 text-sm text-navy/60">
          <Link href="/admin/imports" className="underline">
            Back to import history
          </Link>
        </p>
        <ImportPreview
          importRecord={importRecord}
          rows={rows}
          missing={missing}
        />
      </div>
    </main>
  );
}
