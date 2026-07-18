"use client";

/**
 * Four-section attendance summary for the mobile check-in form: Registered,
 * Already Arrived, Arriving Now and Remaining After. Each row shows the
 * graduate, adult guests, both child categories and the total party. Values
 * are display only; the server is always authoritative.
 */

interface CategoryCounts {
  graduate: number;
  adultGuests: number;
  children0To4: number;
  children5To10: number;
}

interface AttendanceProgressProps {
  registered: CategoryCounts;
  arrivedBefore: CategoryCounts;
  arrivingNow: CategoryCounts;
}

function total(counts: CategoryCounts): number {
  return (
    counts.graduate +
    counts.adultGuests +
    counts.children0To4 +
    counts.children5To10
  );
}

function subtract(a: CategoryCounts, b: CategoryCounts): CategoryCounts {
  return {
    graduate: Math.max(a.graduate - b.graduate, 0),
    adultGuests: Math.max(a.adultGuests - b.adultGuests, 0),
    children0To4: Math.max(a.children0To4 - b.children0To4, 0),
    children5To10: Math.max(a.children5To10 - b.children5To10, 0),
  };
}

function add(a: CategoryCounts, b: CategoryCounts): CategoryCounts {
  return {
    graduate: a.graduate + b.graduate,
    adultGuests: a.adultGuests + b.adultGuests,
    children0To4: a.children0To4 + b.children0To4,
    children5To10: a.children5To10 + b.children5To10,
  };
}

const ROWS: { key: keyof CategoryCounts; label: string }[] = [
  { key: "graduate", label: "Graduate" },
  { key: "adultGuests", label: "Adult guests" },
  { key: "children0To4", label: "Children 0 to 4" },
  { key: "children5To10", label: "Children 5 to 10" },
];

function Section({
  title,
  counts,
  tone,
}: {
  title: string;
  counts: CategoryCounts;
  tone: "neutral" | "arrived" | "now" | "remaining";
}) {
  const toneClass = {
    neutral: "border-navy/15 bg-white",
    arrived: "border-navy/15 bg-cream",
    now: "border-emerald-300 bg-emerald-50",
    remaining: "border-gold bg-white",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <h4 className="text-sm font-bold uppercase tracking-wide text-navy">
        {title}
      </h4>
      <dl className="mt-2 space-y-1 text-sm text-navy">
        {ROWS.map((row) => (
          <div key={row.key} className="flex justify-between gap-2">
            <dt>{row.label}</dt>
            <dd className="font-semibold">{counts[row.key]}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-2 border-t border-navy/15 pt-1">
          <dt className="font-semibold">Total party</dt>
          <dd className="font-bold">{total(counts)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function AttendanceProgress({
  registered,
  arrivedBefore,
  arrivingNow,
}: AttendanceProgressProps) {
  const arrivedTotal = add(arrivedBefore, arrivingNow);
  const remainingAfter = subtract(registered, arrivedTotal);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Section title="Registered" counts={registered} tone="neutral" />
      <Section title="Already Arrived" counts={arrivedBefore} tone="arrived" />
      <Section title="Arriving Now" counts={arrivingNow} tone="now" />
      <Section
        title="Remaining After"
        counts={remainingAfter}
        tone="remaining"
      />
    </div>
  );
}
