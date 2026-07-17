import Link from "next/link";
import { requireAdministratorPage } from "@/features/auth/guards";
import { CreateStaffForm } from "@/features/staff/components/create-staff-form";

export const dynamic = "force-dynamic";

export default async function CreateStaffPage() {
  await requireAdministratorPage("/admin/staff/new");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8 sm:px-10">
      <h1 className="text-2xl font-bold text-navy">Create staff account</h1>
      <p className="mt-1 text-sm text-navy/70">
        A cryptographically secure temporary password is generated for the
        new account and shown exactly once. The staff member must change it
        at first sign-in.
      </p>

      <div className="mt-6">
        <CreateStaffForm />
      </div>

      <p className="mt-8 text-sm text-navy/60">
        <Link href="/admin/staff" className="underline">
          Back to staff accounts
        </Link>
      </p>
    </main>
  );
}
