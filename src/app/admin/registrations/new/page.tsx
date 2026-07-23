import Link from "next/link";
import { requireAdministratorPage } from "@/features/auth/guards";
import { ManualAddForm } from "@/features/registrations/components/manual-add-form";

export const dynamic = "force-dynamic";

export default async function NewRegistrationPage() {
  await requireAdministratorPage("/admin/registrations/new");

  return (
    <main className="flex flex-1 flex-col bg-cream">
      <div className="border-b-4 border-gold bg-navy px-6 py-8 text-white sm:px-10">
        <div className="mx-auto w-full max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-light">
            Toronto Academy of Education
          </p>
          <h1 className="mt-2 text-2xl font-bold">Add a graduate</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/80">
            For a late RSVP, a missing RSVP or a walk-in on the day. A
            walk-in can be registered and checked in even with no email
            address and no PDF.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-8 sm:px-10">
        <ManualAddForm />

        <p className="mt-8 flex flex-wrap gap-4 text-sm text-navy/60">
          <Link href="/admin/tickets/manual-delivery" className="underline">
            Manual Delivery Desk
          </Link>
          <Link href="/admin/roster" className="underline">
            Graduate roster
          </Link>
        </p>
      </div>
    </main>
  );
}
