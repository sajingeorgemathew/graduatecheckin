/**
 * Ticket activity timeline. Shows action, acting staff display name,
 * reason and time. Raw tokens, token hashes and contact details are never
 * part of the activity entries.
 */

import Link from "next/link";
import type { TicketActivityEntry } from "@/features/tickets/types";

const ACTION_LABELS: Record<TicketActivityEntry["action"], string> = {
  generated: "Ticket generated",
  replaced: "Ticket replaced",
  revoked: "Ticket revoked",
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("en-CA", { timeZone: "America/Toronto" });
}

export function ActivityTimeline({
  entries,
  currentTicketId,
}: {
  entries: TicketActivityEntry[];
  currentTicketId: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-navy/10 bg-white p-4 text-sm text-navy/70">
        No recorded activity for this ticket yet.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-navy">
              {ACTION_LABELS[entry.action]}
            </p>
            <p className="text-xs text-navy/60">{formatTime(entry.createdAt)}</p>
          </div>
          <p className="mt-1 text-sm text-navy/75">
            By {entry.actorDisplayName ?? "an administrator"}
          </p>
          {entry.reason !== null && (
            <p className="mt-1 text-sm text-navy">Reason: {entry.reason}</p>
          )}
          {entry.action === "replaced" &&
            entry.replacementTicketId !== null &&
            entry.replacementTicketId !== currentTicketId && (
              <Link
                href={`/admin/tickets/${entry.replacementTicketId}`}
                className="mt-2 inline-block text-sm font-semibold text-navy underline hover:text-navy-light"
              >
                View replacement ticket
              </Link>
            )}
        </li>
      ))}
    </ol>
  );
}
