import { ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Public landing page for authenticated users without an active staff
 * profile. Kept outside the protected route groups so blocked accounts
 * never enter a redirect loop. No staff or registration data is shown.
 */
export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-cream px-6">
      <div className="w-full max-w-md rounded-lg border border-navy/10 bg-white p-8 text-center shadow-sm">
        <ShieldAlert aria-hidden className="mx-auto h-10 w-10 text-gold" />
        <h1 className="mt-4 text-2xl font-bold text-navy">
          Account not authorized
        </h1>
        <p className="mt-3 text-sm text-navy/75">
          This account does not currently have access to the Graduation
          Check-In staff tools. Contact an administrator if you believe this
          is a mistake.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button
            type="submit"
            className="w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-gold-light shadow-sm hover:bg-navy-light"
          >
            Sign Out
          </button>
        </form>
      </div>
    </main>
  );
}
