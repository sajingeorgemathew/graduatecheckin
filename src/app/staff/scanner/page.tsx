import { requireStaffPage } from "@/features/auth/guards";
import { ScannerShell } from "@/features/scanner/components/scanner-shell";
import {
  SCANNER_PAGE_PATH,
  SCANNER_SUPPORT_TEXT,
  SCANNER_VALIDATION_ONLY_NOTICE,
} from "@/features/scanner/constants";

export const dynamic = "force-dynamic";

/**
 * Mobile staff scanner page. Authorizes server-side for scanner-level
 * roles independently of the layout and proxy. All camera work happens
 * in the client components; nothing camera related runs on the server.
 */
export default async function ScannerPage() {
  await requireStaffPage(SCANNER_PAGE_PATH, "scanner");

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold text-navy">
        Graduation Ticket Scanner
      </h1>
      <p className="mt-1 text-sm text-navy/70">{SCANNER_SUPPORT_TEXT}</p>

      <div
        role="note"
        className="mt-4 rounded-lg border border-gold bg-white px-4 py-3 text-sm font-semibold text-navy"
      >
        {SCANNER_VALIDATION_ONLY_NOTICE}
      </div>

      <div className="mt-6">
        <ScannerShell />
      </div>
    </main>
  );
}
