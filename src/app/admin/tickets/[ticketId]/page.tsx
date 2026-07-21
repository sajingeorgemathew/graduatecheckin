import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdministratorPage } from "@/features/auth/guards";
import { ActivityTimeline } from "@/features/tickets/components/activity-timeline";
import { TicketActions } from "@/features/tickets/components/ticket-actions";
import { TicketCard } from "@/features/tickets/components/ticket-card";
import {
  TicketStatusBadge,
  RegistrationStatusBadge,
} from "@/features/tickets/components/ticket-status-badge";
import { DocumentSection } from "@/features/ticket-documents/components/document-section";
import { loadTicketDocumentSection } from "@/features/ticket-documents/read-service";
import { getTicketDetail } from "@/features/tickets/service";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ ticketId: string }>;
}

function formatTime(value: string | null): string {
  if (value === null) {
    return "Not recorded";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("en-CA", { timeZone: "America/Toronto" });
}

/** QR image path. Contains the ticket UUID only, never a token. */
function qrSrcFor(status: string, ticketId: string): string | null {
  if (status === "active") {
    return `/api/admin/tickets/${ticketId}/qr`;
  }
  if (status === "revoked" || status === "replaced") {
    return `/api/admin/tickets/${ticketId}/qr?view=historical`;
  }
  return null;
}

export default async function TicketDetailPage({ params }: PageProps) {
  const { ticketId } = await params;
  const session = await requireAdministratorPage(`/admin/tickets/${ticketId}`);

  const result = await getTicketDetail(session, ticketId);
  if (!result.ok) {
    if (result.status === 404 || result.status === 422) {
      notFound();
    }
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8 sm:px-10">
        <p className="rounded-lg border border-gold bg-white p-6 text-sm text-navy">
          {result.error.error.message}
        </p>
      </main>
    );
  }
  const ticket = result.data;

  // Additive PDF section. A failure here must never break the existing
  // ticket detail view, so the section is simply omitted.
  const documentResult = await loadTicketDocumentSection(session, ticketId);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8 sm:px-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-navy">Ticket detail</h1>
          <TicketStatusBadge status={ticket.status} />
        </div>
        <Link
          href="/admin/tickets"
          className="text-sm font-semibold text-navy underline hover:text-navy-light"
        >
          Return to Ticket Management
        </Link>
      </div>

      {ticket.status === "replaced" && ticket.replacedByTicketId !== null && (
        <div
          role="status"
          className="mt-4 rounded-lg border border-gold bg-white p-4 shadow-sm"
        >
          <p className="font-semibold text-navy">
            This ticket has been replaced and is no longer valid.
          </p>
          <Link
            href={`/admin/tickets/${ticket.replacedByTicketId}`}
            className="mt-1 inline-block text-sm font-semibold text-navy underline hover:text-navy-light"
          >
            View the current ticket
          </Link>
        </div>
      )}

      <div className="ticket-print-area mt-6">
        <TicketCard
          graduateName={ticket.graduateName}
          eventName={ticket.eventName}
          startsAt={ticket.startsAt}
          timezone={ticket.timezone}
          venueName={ticket.venueName}
          venueAddress={ticket.venueAddress}
          registeredAdultGuests={ticket.registeredAdultGuests}
          registeredChildren04={ticket.registeredChildren04}
          registeredChildren510={ticket.registeredChildren510}
          partySize={ticket.partySize}
          ticketCode={ticket.ticketCode}
          status={ticket.status}
          qrSrc={qrSrcFor(ticket.status, ticket.ticketId)}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-navy">Issue details</h2>
          <dl className="mt-2 space-y-1 text-sm text-navy">
            <div className="flex gap-2">
              <dt className="w-32 font-semibold">Issued</dt>
              <dd>{formatTime(ticket.issuedAt)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 font-semibold">Issued by</dt>
              <dd>{ticket.issuedByDisplayName ?? "Not recorded"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 font-semibold">Registration</dt>
              <dd>
                <RegistrationStatusBadge status={ticket.registrationStatus} />
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 font-semibold">Environment</dt>
              <dd>{ticket.isTest ? "Test" : "Production"}</dd>
            </div>
          </dl>
        </div>

        {(ticket.status === "revoked" || ticket.status === "replaced") && (
          <div className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-navy">
              {ticket.status === "revoked"
                ? "Revocation details"
                : "Replacement details"}
            </h2>
            <dl className="mt-2 space-y-1 text-sm text-navy">
              <div className="flex gap-2">
                <dt className="w-32 font-semibold">When</dt>
                <dd>{formatTime(ticket.revokedAt)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-32 font-semibold">By</dt>
                <dd>{ticket.revokedByDisplayName ?? "Not recorded"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-32 font-semibold">Reason</dt>
                <dd>{ticket.revocationReason ?? "Not recorded"}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      {ticket.status === "active" && (
        <div className="mt-6">
          <TicketActions ticketId={ticket.ticketId} />
        </div>
      )}

      {documentResult.ok && (
        <DocumentSection
          data={documentResult.data}
          canRegenerate={ticket.status === "active"}
        />
      )}

      <h2 className="mt-8 text-lg font-semibold text-navy">Activity</h2>
      <div className="mt-3">
        <ActivityTimeline
          entries={ticket.activity}
          currentTicketId={ticket.ticketId}
        />
      </div>
    </main>
  );
}
