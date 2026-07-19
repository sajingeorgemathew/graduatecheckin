/**
 * Presentational dashboard summary cards. Displays aggregate counts only;
 * no personal information is ever shown here.
 */

import type { AttendanceSummaryView } from "../types";

interface SummaryCardsProps {
  summary: AttendanceSummaryView;
}

interface Card {
  label: string;
  value: number;
}

export function AttendanceSummaryCards({ summary }: SummaryCardsProps) {
  const cards: Card[] = [
    { label: "Eligible registrations", value: summary.eligibleRegistrations },
    { label: "Graduates arrived", value: summary.graduatesArrived },
    { label: "Fully checked in", value: summary.fullyCheckedIn },
    { label: "Partially checked in", value: summary.partiallyCheckedIn },
    { label: "Not yet arrived", value: summary.notYetArrived },
    { label: "Expected attendance", value: summary.expectedTotalAttendance },
    { label: "Total people arrived", value: summary.totalPeopleArrived },
    {
      label: "Remaining expected",
      value: summary.remainingExpectedAttendance,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm"
        >
          <p className="text-2xl font-bold text-navy">{card.value}</p>
          <p className="mt-1 text-xs font-semibold text-navy/70">
            {card.label}
          </p>
        </div>
      ))}
    </div>
  );
}
