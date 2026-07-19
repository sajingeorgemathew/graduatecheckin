/**
 * Append-only attendance history for one registration. Shows every entry,
 * including reversals and the rows they reverse, and offers a Reverse Entry
 * action only on an eligible entry. Reasons are shown because this view is
 * reached only by supervisor-level staff.
 */

import { ENTRY_KIND_LABELS, formatDelta, formatTime } from "../labels";
import type { AttendanceHistoryEntry } from "../types";

interface AttendanceHistoryProps {
  entries: AttendanceHistoryEntry[];
  onReverse: (entry: AttendanceHistoryEntry) => void;
}

export function AttendanceHistory({
  entries,
  onReverse,
}: AttendanceHistoryProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-navy/70">No attendance activity recorded yet.</p>
    );
  }
  return (
    <ul className="space-y-3">
      {entries.map((entry, index) => (
        <li
          key={`${entry.occurredAt}-${index}`}
          className="rounded-lg border border-navy/10 bg-white p-3 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-navy/5 px-2.5 py-0.5 text-xs font-semibold text-navy">
              {ENTRY_KIND_LABELS[entry.entryKind]}
            </span>
            <span className="text-xs text-navy/60">
              {formatTime(entry.occurredAt)}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-navy sm:grid-cols-4">
            <span>Graduate {formatDelta(entry.graduateDelta)}</span>
            <span>Adults {formatDelta(entry.adultGuestDelta)}</span>
            <span>Children 0 to 4 {formatDelta(entry.child0To4Delta)}</span>
            <span>Children 5 to 10 {formatDelta(entry.child5To10Delta)}</span>
          </div>
          <p className="mt-2 text-xs text-navy/70">
            Recorded by {entry.recordedByName}
          </p>
          {entry.reason !== null && (
            <p className="mt-1 text-xs text-navy/70">Reason: {entry.reason}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            {entry.reversed && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900">
                Reversed
              </span>
            )}
            {entry.isReversal && (
              <span className="rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold text-navy">
                Reversal entry
              </span>
            )}
            {entry.entryReference !== null && (
              <button
                type="button"
                onClick={() => onReverse(entry)}
                className="min-h-9 rounded-lg border-2 border-navy bg-white px-3 py-1.5 text-xs font-semibold text-navy"
              >
                Reverse Entry
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
