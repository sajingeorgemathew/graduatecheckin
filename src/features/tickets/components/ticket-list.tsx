/**
 * Searchable, paginated ticket table: a desktop table plus a mobile card
 * layout. Rows carry graduate name, ticket code, party size and statuses
 * only. No raw tokens, token hashes or contact information ever appear.
 */

import Link from "next/link";
import type {
  TicketListFilter,
  TicketListPage,
} from "@/features/tickets/types";
import { ticketsPageHref } from "./ticket-filters";
import {
  NoTicketBadge,
  RegistrationStatusBadge,
  TicketStatusBadge,
} from "./ticket-status-badge";

function formatIssued(value: string | null): string {
  if (value === null) {
    return "Not issued";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("en-CA", { timeZone: "America/Toronto" });
}

function RowActions({ ticketId }: { ticketId: string | null }) {
  if (ticketId === null) {
    return (
      <Link
        href="/admin/tickets/generate"
        className="text-xs font-semibold text-navy underline hover:text-navy-light"
      >
        Generate
      </Link>
    );
  }
  return (
    <Link
      href={`/admin/tickets/${ticketId}`}
      className="text-xs font-semibold text-navy underline hover:text-navy-light"
    >
      View ticket
    </Link>
  );
}

export function TicketList({
  list,
  filter,
  search,
}: {
  list: TicketListPage;
  filter: TicketListFilter;
  search: string;
}) {
  if (list.rows.length === 0) {
    return (
      <p className="mt-6 rounded-lg border border-navy/10 bg-white p-6 text-sm text-navy/70">
        No registrations match this filter and search.
      </p>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="mt-4 hidden overflow-x-auto rounded-lg border border-navy/10 bg-white shadow-sm lg:block">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-navy text-gold-light">
            <tr>
              <th className="px-3 py-2 font-semibold">Graduate</th>
              <th className="px-3 py-2 font-semibold">Ticket code</th>
              <th className="px-3 py-2 font-semibold">Party size</th>
              <th className="px-3 py-2 font-semibold">Registration status</th>
              <th className="px-3 py-2 font-semibold">Ticket status</th>
              <th className="px-3 py-2 font-semibold">Issued</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/10 text-navy">
            {list.rows.map((row) => (
              <tr key={row.registrationId}>
                <td className="px-3 py-2 font-semibold">
                  {row.graduateName}
                  {row.isTest && (
                    <span className="ml-2 rounded-full bg-gold-light px-2 py-0.5 text-[10px] font-semibold uppercase text-navy">
                      Test
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono">
                  {row.ticketCode ?? "None"}
                </td>
                <td className="px-3 py-2">{row.partySize}</td>
                <td className="px-3 py-2">
                  <RegistrationStatusBadge status={row.registrationStatus} />
                </td>
                <td className="px-3 py-2">
                  {row.ticketStatus !== null ? (
                    <TicketStatusBadge status={row.ticketStatus} />
                  ) : (
                    <NoTicketBadge />
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {formatIssued(row.issuedAt)}
                </td>
                <td className="px-3 py-2">
                  <RowActions ticketId={row.ticketId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:hidden">
        {list.rows.map((row) => (
          <div
            key={row.registrationId}
            className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-navy">{row.graduateName}</p>
              {row.ticketStatus !== null ? (
                <TicketStatusBadge status={row.ticketStatus} />
              ) : (
                <NoTicketBadge />
              )}
            </div>
            <dl className="mt-3 space-y-1 text-sm text-navy">
              <div className="flex gap-2">
                <dt className="w-36 font-semibold">Ticket code</dt>
                <dd className="font-mono">{row.ticketCode ?? "None"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-36 font-semibold">Party size</dt>
                <dd>{row.partySize}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-36 font-semibold">Registration</dt>
                <dd>
                  <RegistrationStatusBadge status={row.registrationStatus} />
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-36 font-semibold">Issued</dt>
                <dd>{formatIssued(row.issuedAt)}</dd>
              </div>
            </dl>
            <div className="mt-3">
              <RowActions ticketId={row.ticketId} />
            </div>
          </div>
        ))}
      </div>

      {list.totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center gap-3">
          {list.page > 1 && (
            <Link
              href={ticketsPageHref(filter, search, list.page - 1)}
              className="rounded-md border border-navy px-3 py-1.5 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-navy/70">
            Page {list.page} of {list.totalPages}
          </span>
          {list.page < list.totalPages && (
            <Link
              href={ticketsPageHref(filter, search, list.page + 1)}
              className="rounded-md border border-navy px-3 py-1.5 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
