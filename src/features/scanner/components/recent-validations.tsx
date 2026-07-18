"use client";

/**
 * Current-session scan history. Entries live in React memory only, are
 * cleared on page refresh and never touch browser storage. They contain
 * time, result, and the graduate name and ticket code when those were
 * safely returned; never payloads or hashes.
 */

import type { RecentValidationEntry } from "../types";

interface RecentValidationsProps {
  entries: readonly RecentValidationEntry[];
}

const RESULT_LABELS: Record<RecentValidationEntry["result"], string> = {
  valid: "Valid",
  partially_checked_in: "Partial arrival",
  already_checked_in: "Already checked in",
  invalid: "Invalid",
  revoked: "Revoked",
  replaced: "Replaced",
  pending: "Not ready",
  wrong_event: "Different event",
  registration_blocked: "Requires review",
  rate_limited: "Rate limited",
  error: "Error",
};

const OK_RESULTS = new Set<RecentValidationEntry["result"]>([
  "valid",
  "partially_checked_in",
  "already_checked_in",
]);

export function RecentValidations({ entries }: RecentValidationsProps) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <section aria-label="Recent validations" className="mt-8">
      <h2 className="text-lg font-semibold text-navy">
        Recent validations this session
      </h2>
      <p className="text-xs text-navy/60">
        Cleared when this page is refreshed.
      </p>
      <ul className="mt-3 space-y-2">
        {entries.map((entry) => (
          <li
            key={entry.key}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy/10 bg-white px-4 py-2.5 text-sm"
          >
            <span className="text-navy/60">{entry.time}</span>
            <span className="flex-1 truncate px-2 font-semibold text-navy">
              {entry.graduateName ?? ""}
              {entry.ticketCode !== null && (
                <span className="ml-2 font-mono text-xs text-navy/70">
                  {entry.ticketCode}
                </span>
              )}
            </span>
            <span
              className={
                OK_RESULTS.has(entry.result)
                  ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900"
                  : "rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-900"
              }
            >
              {RESULT_LABELS[entry.result]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
