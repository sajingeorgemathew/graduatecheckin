import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/components/login-form";
import { STAFF_HOME_PATH } from "@/features/auth/constants";
import { loginDestination, sanitizeNextPath } from "@/features/auth/redirects";
import { getOptionalStaffSession } from "@/features/auth/session";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { next } = await searchParams;

  // Already authorized staff never see the login form again.
  const session = await getOptionalStaffSession();
  if (session !== null) {
    redirect(loginDestination(session.mustChangePassword, next));
  }

  const safeNext = sanitizeNextPath(next);

  return (
    <main className="flex min-h-screen flex-col bg-cream">
      <div className="border-b-4 border-gold bg-navy px-6 py-12 text-white sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-light">
            Toronto Academy of Education
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Staff Sign In
          </h1>
          <p className="mt-3 text-sm text-white/85">
            Authorized staff may sign in to manage graduation registration
            and event check-in.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md flex-1 px-6 py-10 sm:px-0">
        <div className="rounded-lg border border-navy/10 bg-white p-6 shadow-sm">
          <LoginForm next={safeNext === STAFF_HOME_PATH ? null : safeNext} />
        </div>
      </div>

      <footer className="border-t border-navy/10 bg-white px-6 py-6">
        <p className="mx-auto w-full max-w-md text-sm text-navy/70">
          Toronto Academy of Education, Graduation Check-In
        </p>
      </footer>
    </main>
  );
}
