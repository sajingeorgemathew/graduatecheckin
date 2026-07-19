/**
 * Presentational search results. Each card shows the graduate name,
 * registration and ticket status, registered, arrived and remaining party
 * counts and the attendance classification. No email, phone, guest name,
 * payment value or database UUID is shown. Actions open the detail, manual
 * arrival or correction workspace.
 */

import { CLASSIFICATION_LABELS } from "../labels";
import type { AttendanceSearchResult } from "../types";

interface SearchResultsProps {
  results: AttendanceSearchResult[];
  matched: number;
  truncated: boolean;
  onView: (result: AttendanceSearchResult) => void;
  onManual: (result: AttendanceSearchResult) => void;
  onCorrect: (result: AttendanceSearchResult) => void;
}

function partyLine(label: string, party: AttendanceSearchResult["registered"]) {
  return `${label}: G ${party.graduate}, A ${party.adultGuests}, C0-4 ${party.children0To4}, C5-10 ${party.children5To10}`;
}

export function AttendanceSearchResults({
  results,
  matched,
  truncated,
  onView,
  onManual,
  onCorrect,
}: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <p className="mt-3 text-sm text-navy/70">No matching registrations.</p>
    );
  }
  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs font-semibold text-navy/70">
        {truncated
          ? `Showing the first ${results.length} of ${matched} matches. Refine the search or filters to narrow results.`
          : `${matched} ${matched === 1 ? "result" : "results"}.`}
      </p>
      {results.map((result) => (
        <div
          key={result.registrationReference}
          className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-navy">{result.graduateName}</p>
            <span className="rounded-full bg-navy/5 px-2.5 py-0.5 text-xs font-semibold text-navy">
              {CLASSIFICATION_LABELS[result.classification]}
            </span>
          </div>
          <p className="mt-1 text-xs text-navy/70">
            Registration: {result.registrationStatus}
            {result.ticketStatus !== null && ` | Ticket: ${result.ticketStatus}`}
          </p>
          <div className="mt-2 space-y-0.5 text-xs text-navy/80">
            <p>{partyLine("Registered", result.registered)}</p>
            <p>{partyLine("Arrived", result.arrived)}</p>
            <p>{partyLine("Remaining", result.remaining)}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onView(result)}
              className="min-h-9 rounded-lg border-2 border-navy bg-white px-3 py-1.5 text-xs font-semibold text-navy"
            >
              View Attendance
            </button>
            <button
              type="button"
              onClick={() => onManual(result)}
              className="min-h-9 rounded-lg border-2 border-navy bg-navy px-3 py-1.5 text-xs font-semibold text-white"
            >
              Manual Arrival
            </button>
            <button
              type="button"
              onClick={() => onCorrect(result)}
              className="min-h-9 rounded-lg border-2 border-navy bg-white px-3 py-1.5 text-xs font-semibold text-navy"
            >
              Correct Attendance
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
