import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { hasImportAccess } from "@/features/imports/access";
import { ImportsDisabledNotice } from "@/features/imports/components/disabled-notice";
import { UploadForm } from "@/features/imports/components/upload-form";

export const dynamic = "force-dynamic";

export default function NewImportPage() {
  if (!hasImportAccess()) {
    return <ImportsDisabledNotice />;
  }

  return (
    <main className="flex min-h-screen flex-col bg-cream">
      <div className="border-b-4 border-gold bg-navy px-6 py-10 text-white sm:px-10">
        <div className="mx-auto w-full max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-light">
            Toronto Academy of Education
          </p>
          <h1 className="mt-2 text-3xl font-bold">New registration import</h1>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-8 sm:px-10">
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-gold bg-white p-4 shadow-sm"
        >
          <TriangleAlert
            aria-hidden
            className="mt-0.5 h-5 w-5 shrink-0 text-gold"
          />
          <div>
            <p className="font-semibold text-navy">Development-only access</p>
            <p className="text-sm text-navy/75">
              This import workspace is only available during development with
              the explicit development import flag. It stays disabled in
              production until staff authentication is completed.
            </p>
          </div>
        </div>

        <UploadForm />

        <p className="mt-8 text-sm text-navy/60">
          <Link href="/admin/imports" className="underline">
            Back to import history
          </Link>
        </p>
      </div>
    </main>
  );
}
