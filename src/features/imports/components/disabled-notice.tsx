import { TriangleAlert } from "lucide-react";

/**
 * Shown when the import feature is unavailable. The feature only operates
 * in development with the explicit ENABLE_DEV_IMPORTS flag until staff
 * authentication is completed in CHECKIN-04.
 */
export function ImportsDisabledNotice() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-cream px-6">
      <div className="w-full max-w-xl rounded-lg border border-gold bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <TriangleAlert aria-hidden className="h-6 w-6 text-gold" />
          <h1 className="text-xl font-semibold text-navy">
            Imports are not available
          </h1>
        </div>
        <p className="mt-4 text-sm text-navy/75">
          The registration import workflow is disabled in this environment.
          It only operates during development with the explicit development
          import flag enabled. Staff authentication will unlock protected
          access in a later update.
        </p>
      </div>
    </main>
  );
}
