import Link from "next/link";
import { Suspense } from "react";
import { requireAdministratorPage } from "@/features/auth/guards";
import { DeliveryDesk } from "@/features/manual-delivery/components/delivery-desk";
import { loadManualDeliveryDesk } from "@/features/manual-delivery/read-service";
import {
  manualDeliveryFilterSchema,
  manualDeliverySearchSchema,
} from "@/features/manual-delivery/schemas";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ filter?: string; search?: string }>;
}

export default async function ManualDeliveryPage({ searchParams }: PageProps) {
  const session = await requireAdministratorPage(
    "/admin/tickets/manual-delivery"
  );
  const params = await searchParams;
  const filter = manualDeliveryFilterSchema.parse(params.filter ?? "all");
  const search = manualDeliverySearchSchema.parse(params.search ?? "");

  const result = await loadManualDeliveryDesk(session, filter, search);

  return (
    <main className="flex flex-1 flex-col bg-cream">
      <div className="border-b-4 border-gold bg-navy px-6 py-8 text-white sm:px-10">
        <div className="mx-auto w-full max-w-7xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-light">
            Toronto Academy of Education
          </p>
          <h1 className="mt-2 text-2xl font-bold">Manual Delivery Desk</h1>
          <p className="mt-1 max-w-3xl text-sm text-white/80">
            {result.ok ? `${result.data.eventName}. ` : ""}
            Copy each graduate&apos;s personalized email into Gmail, attach
            the named PDF, send it yourself, then record the send here. The
            application never sends email and never claims a ticket was sent
            until you confirm it.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 sm:px-10">
        {result.ok ? (
          <Suspense
            fallback={<p className="text-sm text-navy/70">Loading the desk...</p>}
          >
            <DeliveryDesk data={result.data} />
          </Suspense>
        ) : (
          <p
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800"
          >
            {result.message}
          </p>
        )}

        <p className="mt-8 flex flex-wrap gap-4 text-sm text-navy/60">
          <Link href="/admin" className="underline">
            Back to administration
          </Link>
          <Link href="/admin/production-import" className="underline">
            Production import
          </Link>
          <Link href="/admin/roster" className="underline">
            Graduate roster
          </Link>
        </p>
      </div>
    </main>
  );
}
