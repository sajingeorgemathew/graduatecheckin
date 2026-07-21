import Link from "next/link";

import type { TicketDocumentListFilter } from "../types";

const FILTERS: { value: TicketDocumentListFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "missing", label: "Missing PDF" },
  { value: "current", label: "Current" },
  { value: "outdated", label: "Outdated" },
  { value: "invalidated", label: "Invalidated" },
  { value: "ready_for_export", label: "Ready for export" },
  { value: "missing_email", label: "Missing email" },
  { value: "test", label: "Test" },
  { value: "production", label: "Production" },
];

/** Filter links for the documents administration page. */
export function DocumentFilters({
  filter,
}: {
  filter: TicketDocumentListFilter;
}) {
  return (
    <nav aria-label="Document filters" className="flex flex-wrap gap-2">
      {FILTERS.map((entry) => {
        const isActive = entry.value === filter;
        return (
          <Link
            key={entry.value}
            href={`/admin/tickets/documents?filter=${entry.value}`}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-gold-light"
                : "rounded-md border border-navy/15 bg-white px-3 py-1.5 text-sm font-medium text-navy/80 hover:border-navy/30"
            }
          >
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}
