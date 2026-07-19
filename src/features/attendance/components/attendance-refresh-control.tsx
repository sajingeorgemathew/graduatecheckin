/**
 * Dashboard refresh control. Shows the last-updated time, a refreshing
 * status, a manual Refresh button and a stale-data warning after the
 * configured threshold. All polling logic lives in the parent; this is a
 * presentational control.
 */

import { formatTime } from "../labels";

interface RefreshControlProps {
  lastUpdated: string | null;
  refreshing: boolean;
  stale: boolean;
  onRefresh: () => void;
}

export function AttendanceRefreshControl({
  lastUpdated,
  refreshing,
  stale,
  onRefresh,
}: RefreshControlProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-navy/75">
        <span aria-live="polite">
          {refreshing
            ? "Refreshing..."
            : lastUpdated !== null
              ? `Last updated ${formatTime(lastUpdated)}`
              : "Not yet loaded"}
        </span>
        {stale && (
          <span
            role="alert"
            className="ml-3 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900"
          >
            Data may be stale
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="min-h-10 rounded-lg border-2 border-navy bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Refresh
      </button>
    </div>
  );
}
