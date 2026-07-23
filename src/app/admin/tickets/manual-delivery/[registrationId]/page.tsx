import { notFound } from "next/navigation";
import { requireAdministratorPage } from "@/features/auth/guards";
import { OperatorPanel } from "@/features/manual-delivery/components/operator-panel";
import { loadManualDeliveryDetail } from "@/features/manual-delivery/read-service";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ registrationId: string }>;
}

export default async function ManualDeliveryDetailPage({ params }: PageProps) {
  const { registrationId } = await params;
  const session = await requireAdministratorPage(
    `/admin/tickets/manual-delivery/${registrationId}`
  );

  const result = await loadManualDeliveryDetail(session, registrationId);
  if (!result.ok) {
    if (result.status === 404) {
      notFound();
    }
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:px-10">
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          {result.message}
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-cream">
      <div className="border-b-4 border-gold bg-navy px-6 py-6 text-white sm:px-10">
        <div className="mx-auto w-full max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-light">
            Manual Delivery Desk
          </p>
          <h1 className="mt-1 text-2xl font-bold">Send one ticket</h1>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 sm:px-10">
        <OperatorPanel detail={result.data} />
      </div>
    </main>
  );
}
