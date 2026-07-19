/**
 * Recent attendance activity feed. Renders as a table on wide screens and as
 * stacked cards on phones, never scrolling horizontally. Shows the entry
 * type, per-category deltas with explicit signs, the recording staff display
 * name and the reason. Reasons are shown because the dashboard is reached
 * only by supervisor-level staff.
 */

import { ENTRY_KIND_LABELS, formatDelta, formatTime } from "../labels";
import type { AttendanceActivityEntry } from "../types";

interface ActivityProps {
  entries: AttendanceActivityEntry[];
}

export function AttendanceActivity({ entries }: ActivityProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-navy/70">No attendance activity yet.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {entries.map((entry, index) => (
        <li
          key={`${entry.occurredAt}-${index}`}
          className="rounded-lg border border-navy/10 bg-white p-3 text-sm shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-navy">
              {entry.graduateName}
            </span>
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-navy/5 px-2 py-0.5 text-xs font-semibold text-navy">
                {ENTRY_KIND_LABELS[entry.entryKind]}
              </span>
              <span className="text-xs text-navy/60">
                {formatTime(entry.occurredAt)}
              </span>
            </span>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-navy/80 sm:grid-cols-4">
            <span>Graduate {formatDelta(entry.graduateDelta)}</span>
            <span>Adults {formatDelta(entry.adultGuestDelta)}</span>
            <span>Children 0 to 4 {formatDelta(entry.child0To4Delta)}</span>
            <span>Children 5 to 10 {formatDelta(entry.child5To10Delta)}</span>
          </div>
          <p className="mt-1 text-xs text-navy/60">
            Recorded by {entry.recordedByName}
            {entry.reason !== null && ` | ${entry.reason}`}
          </p>
        </li>
      ))}
    </ul>
  );
}
