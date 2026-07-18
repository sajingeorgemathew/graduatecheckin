/**
 * Filter chips and search box for the ticket-management page. Search
 * covers graduate name, ticket code and source registration ID only;
 * email and phone are intentionally not searchable.
 */

import Link from "next/link";
import type { TicketListFilter } from "@/features/tickets/types";

const FILTERS: { value: TicketListFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "not_generated", label: "Not generated" },
  { value: "revoked", label: "Revoked" },
  { value: "replaced", label: "Replaced" },
  { value: "blocked", label: "Blocked" },
  { value: "test", label: "Test" },
  { value: "production", label: "Production" },
];

export function ticketsPageHref(
  filter: TicketListFilter,
  search: string,
  page: number
): string {
  const params = new URLSearchParams();
  if (filter !== "all") {
    params.set("filter", filter);
  }
  if (search.trim().length > 0) {
    params.set("search", search.trim());
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query.length > 0 ? `/admin/tickets?${query}` : "/admin/tickets";
}

export function TicketFilters({
  filter,
  search,
}: {
  filter: TicketListFilter;
  search: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((entry) => (
          <Link
            key={entry.value}
            href={ticketsPageHref(entry.value, search, 1)}
            className={
              entry.value === filter
                ? "rounded-full bg-navy px-3 py-1 text-xs font-semibold text-gold-light"
                : "rounded-full border border-navy/20 bg-white px-3 py-1 text-xs font-semibold text-navy hover:border-navy"
            }
          >
            {entry.label}
          </Link>
        ))}
      </div>
      <form method="get" action="/admin/tickets" className="flex max-w-md gap-2">
        {filter !== "all" && (
          <input type="hidden" name="filter" value={filter} />
        )}
        <label htmlFor="ticket-search" className="sr-only">
          Search by graduate name, ticket code or registration ID
        </label>
        <input
          id="ticket-search"
          type="search"
          name="search"
          defaultValue={search}
          maxLength={120}
          placeholder="Graduate name, ticket code or registration ID"
          className="w-full rounded-md border border-navy/20 bg-white px-3 py-2 text-sm text-navy placeholder:text-navy/40"
        />
        <button
          type="submit"
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-gold-light hover:bg-navy-light"
        >
          Search
        </button>
      </form>
    </div>
  );
}
