"use client";

/**
 * Post-submission confirmation panel. Renders the safe confirmation view
 * returned by the server for a partial or full arrival, and requires a new
 * scan before another arrival can be recorded. Only staff-safe fields are
 * shown; no database id, token or contact value is present in the view.
 */

import type { CheckinConfirmationView } from "../types";

interface ArrivalConfirmationProps {
  view: CheckinConfirmationView;
  onScanNext: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="font-semibold">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ArrivalConfirmation({
  view,
  onScanNext,
}: ArrivalConfirmationProps) {
  const isComplete = view.result === "complete";
  const heading = isComplete ? "Full Party Checked In" : "Partial Arrival Confirmed";
  const tone = isComplete
    ? "border-emerald-400 bg-emerald-50"
    : "border-gold bg-white";
  const headingTone = isComplete ? "text-emerald-900" : "text-navy";

  const recordedAt =
    view.recordedAt !== null
      ? new Date(view.recordedAt).toLocaleTimeString()
      : "Just now";

  const arriving = [
    { label: "Graduate", value: (view.graduateArrivingNow ?? 0) > 0 ? "Yes" : "No" },
    { label: "Adult guests", value: String(view.adultGuestsArrivingNow ?? 0) },
    {
      label: "Children 0 to 4",
      value: String(view.children0To4ArrivingNow ?? 0),
    },
    {
      label: "Children 5 to 10",
      value: String(view.children5To10ArrivingNow ?? 0),
    },
  ];

  const totals = [
    { label: "Graduate", value: `${view.graduateArrivedTotal ?? 0} of 1` },
    {
      label: "Adult guests",
      value: `${view.adultGuestsArrivedTotal ?? 0} of ${view.registeredAdultGuests ?? 0}`,
    },
    {
      label: "Children 0 to 4",
      value: `${view.children0To4ArrivedTotal ?? 0} of ${view.registeredChildren0To4 ?? 0}`,
    },
    {
      label: "Children 5 to 10",
      value: `${view.children5To10ArrivedTotal ?? 0} of ${view.registeredChildren5To10 ?? 0}`,
    },
  ];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-xl border-2 p-5 shadow-sm ${tone}`}
    >
      <h3 className={`text-2xl font-bold ${headingTone}`}>{heading}</h3>

      {view.graduateName !== null && (
        <p className="mt-2 text-base font-semibold text-navy">
          {view.graduateName}
        </p>
      )}

      <div className="mt-4">
        <h4 className="text-sm font-bold uppercase tracking-wide text-navy">
          Arriving now
        </h4>
        <dl className="mt-2 space-y-1 text-base text-navy">
          {arriving.map((row) => (
            <Row key={row.label} label={row.label} value={row.value} />
          ))}
        </dl>
      </div>

      <div className="mt-4">
        <h4 className="text-sm font-bold uppercase tracking-wide text-navy">
          {isComplete ? "Final attendance" : "Total attendance"}
        </h4>
        <dl className="mt-2 space-y-1 text-base text-navy">
          {totals.map((row) => (
            <Row key={row.label} label={row.label} value={row.value} />
          ))}
        </dl>
      </div>

      {!isComplete && (
        <p className="mt-4 text-base text-navy">
          Remaining to arrive: {view.remainingPartySize ?? 0}
        </p>
      )}

      <p className="mt-4 text-base text-navy/90">
        {isComplete
          ? "The graduate and full registered party have now been recorded as arrived."
          : "Additional registered party members may be checked in when they arrive."}
      </p>

      <p className="mt-2 text-sm text-navy/70">Confirmed at {recordedAt}</p>

      <button
        type="button"
        onClick={onScanNext}
        className="mt-5 min-h-12 w-full rounded-lg bg-navy px-5 py-3 text-base font-semibold text-white hover:bg-navy-light"
      >
        Scan Next Ticket
      </button>
    </div>
  );
}
