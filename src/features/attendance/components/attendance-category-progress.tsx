/**
 * Accessible CSS progress bars for each attendance category. No charting
 * dependency is used. Each row shows arrived out of registered.
 */

import type { AttendanceSummaryView, CategoryProgress } from "../types";

interface CategoryProgressProps {
  summary: AttendanceSummaryView;
}

function ProgressRow({
  label,
  progress,
}: {
  label: string;
  progress: CategoryProgress;
}) {
  const percent =
    progress.registered > 0
      ? Math.min(
          Math.round((progress.arrived / progress.registered) * 100),
          100
        )
      : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm font-semibold text-navy">
        <span>{label}</span>
        <span>
          {progress.arrived} / {progress.registered}
        </span>
      </div>
      <div
        className="mt-1 h-3 w-full overflow-hidden rounded-full bg-navy/10"
        role="progressbar"
        aria-valuenow={progress.arrived}
        aria-valuemin={0}
        aria-valuemax={progress.registered}
        aria-label={`${label} arrived`}
      >
        <div
          className="h-full rounded-full bg-gold"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function AttendanceCategoryProgress({ summary }: CategoryProgressProps) {
  return (
    <div className="space-y-4 rounded-lg border border-navy/10 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-navy">Category progress</h2>
      <ProgressRow label="Graduates" progress={summary.graduates} />
      <ProgressRow label="Adult guests" progress={summary.adultGuests} />
      <ProgressRow label="Children 0 to 4" progress={summary.children0To4} />
      <ProgressRow label="Children 5 to 10" progress={summary.children5To10} />
    </div>
  );
}
