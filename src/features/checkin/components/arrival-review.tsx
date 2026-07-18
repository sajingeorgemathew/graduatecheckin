"use client";

/**
 * Confirmation review shown before submission. Summarizes the arriving-now
 * selection in plain language. No typed confirmation text is required so
 * event entry stays fast.
 */

import type { ArrivalSelection } from "../types";
import { totalArriving } from "../attendance";

interface ArrivalReviewProps {
  selection: ArrivalSelection;
}

export function ArrivalReview({ selection }: ArrivalReviewProps) {
  const rows = [
    { label: "Graduate", value: selection.graduate > 0 ? "Yes" : "No" },
    { label: "Adult guests", value: String(selection.adultGuests) },
    { label: "Children 0 to 4", value: String(selection.children0To4) },
    { label: "Children 5 to 10", value: String(selection.children5To10) },
  ];

  return (
    <div className="rounded-lg border border-navy/15 bg-cream p-4">
      <h4 className="text-sm font-bold uppercase tracking-wide text-navy">
        Arriving now
      </h4>
      <dl className="mt-2 space-y-1 text-base text-navy">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-2">
            <dt>{row.label}</dt>
            <dd className="font-semibold">{row.value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-2 border-t border-navy/15 pt-1">
          <dt className="font-semibold">Total arriving now</dt>
          <dd className="font-bold">{totalArriving(selection)}</dd>
        </div>
      </dl>
    </div>
  );
}
