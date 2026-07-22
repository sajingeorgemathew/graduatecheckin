"use client";

import { Fragment, useMemo, useState } from "react";

import type {
  DeliveryDetailView,
  ResultImportRowView,
} from "../read-service";

interface Props {
  deliveries: DeliveryDetailView[];
  resultImports: ResultImportRowView[];
}

type FilterKey =
  | "all"
  | "prepared"
  | "test_sent"
  | "test_failed"
  | "production_sent"
  | "production_failed"
  | "bounced"
  | "resend_required"
  | "cancelled";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "prepared", label: "Prepared" },
  { key: "test_sent", label: "Test sent" },
  { key: "test_failed", label: "Test failed" },
  { key: "production_sent", label: "Production sent" },
  { key: "production_failed", label: "Production failed" },
  { key: "bounced", label: "Bounced" },
  { key: "resend_required", label: "Resend required" },
  { key: "cancelled", label: "Cancelled" },
];

function matchesFilter(delivery: DeliveryDetailView, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "prepared":
      return delivery.status === "prepared";
    case "test_sent":
      return delivery.latestTestOutcome === "Test sent";
    case "test_failed":
      return delivery.latestTestOutcome === "Test failed";
    case "production_sent":
      return delivery.status === "sent" || delivery.status === "resent";
    case "production_failed":
      return delivery.status === "failed";
    case "bounced":
      return delivery.status === "bounce_detected";
    case "resend_required":
      return delivery.status === "resend_required";
    case "cancelled":
      return delivery.status === "cancelled";
    default:
      return true;
  }
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : "—";
}

export function BatchDetailWorkspace({ deliveries, resultImports }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return deliveries.filter((delivery) => {
      if (!matchesFilter(delivery, filter)) return false;
      if (needle.length === 0) return true;
      return (
        delivery.graduateName.toLowerCase().includes(needle) ||
        delivery.intendedEmail.toLowerCase().includes(needle) ||
        delivery.ticketCode.toLowerCase().includes(needle) ||
        delivery.deliveryReference.toLowerCase().includes(needle)
      );
    });
  }, [deliveries, filter, search]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="mt-8 flex flex-col gap-8">
      <section>
        <h2 className="text-lg font-bold text-navy">Deliveries</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setFilter(entry.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                filter === entry.key
                  ? "bg-navy text-white"
                  : "border border-navy/20 text-navy/70 hover:border-navy/40"
              }`}
            >
              {entry.label}
            </button>
          ))}
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, ticket, reference"
            className="ml-auto w-64 rounded-md border border-navy/20 px-3 py-1.5 text-sm"
          />
        </div>

        {visible.length === 0 ? (
          <p className="mt-3 text-sm text-navy/70">No deliveries match.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-navy/15 text-xs uppercase tracking-wide text-navy/60">
                  <th scope="col" className="px-3 py-2">Graduate</th>
                  <th scope="col" className="px-3 py-2">Intended email</th>
                  <th scope="col" className="px-3 py-2">Ticket</th>
                  <th scope="col" className="px-3 py-2">Reference</th>
                  <th scope="col" className="px-3 py-2">PDF</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">Latest test</th>
                  <th scope="col" className="px-3 py-2">Latest prod.</th>
                  <th scope="col" className="px-3 py-2">Attempts</th>
                  <th scope="col" className="px-3 py-2">Last attempt</th>
                  <th scope="col" className="px-3 py-2">History</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((delivery) => (
                  <Fragment key={delivery.id}>
                    <tr className="border-b border-navy/10">
                      <td className="px-3 py-2 text-navy/90">
                        {delivery.graduateName}
                      </td>
                      <td className="px-3 py-2 text-navy/80">
                        {delivery.intendedEmail}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-navy">
                        {delivery.ticketCode}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-navy">
                        {delivery.deliveryReference}
                      </td>
                      <td className="px-3 py-2 text-xs text-navy/70">
                        {delivery.pdfFileName}
                      </td>
                      <td className="px-3 py-2 text-navy/80">{delivery.status}</td>
                      <td className="px-3 py-2 text-navy/80">
                        {delivery.latestTestOutcome}
                      </td>
                      <td className="px-3 py-2 text-navy/80">
                        {delivery.latestProductionOutcome}
                      </td>
                      <td className="px-3 py-2 text-navy/80">
                        {delivery.attemptCount}
                      </td>
                      <td className="px-3 py-2 text-xs text-navy/70">
                        {formatTime(delivery.lastAttemptAt)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggle(delivery.id)}
                          disabled={delivery.attempts.length === 0}
                          className="rounded border border-navy/20 px-2 py-1 text-xs font-semibold text-navy disabled:opacity-40"
                        >
                          {expanded.has(delivery.id) ? "Hide" : "View history"}
                        </button>
                      </td>
                    </tr>
                    {expanded.has(delivery.id) && (
                      <tr>
                        <td colSpan={11} className="bg-navy/5 px-3 py-3">
                          <AttemptHistory attempts={delivery.attempts} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold text-navy">Result-import history</h2>
        {resultImports.length === 0 ? (
          <p className="mt-2 text-sm text-navy/70">
            No result files have been imported for this batch.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-navy/15 text-xs uppercase tracking-wide text-navy/60">
                  <th scope="col" className="px-3 py-2">File</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">Total</th>
                  <th scope="col" className="px-3 py-2">Accepted</th>
                  <th scope="col" className="px-3 py-2">Duplicate</th>
                  <th scope="col" className="px-3 py-2">Warning</th>
                  <th scope="col" className="px-3 py-2">Rejected</th>
                  <th scope="col" className="px-3 py-2">Imported</th>
                </tr>
              </thead>
              <tbody>
                {resultImports.map((row) => (
                  <tr key={row.id} className="border-b border-navy/10">
                    <td className="px-3 py-2 text-navy/80">{row.fileName}</td>
                    <td className="px-3 py-2 text-navy/80">{row.status}</td>
                    <td className="px-3 py-2 text-navy/80">{row.totalRows}</td>
                    <td className="px-3 py-2 text-navy/80">{row.acceptedRows}</td>
                    <td className="px-3 py-2 text-navy/80">{row.duplicateRows}</td>
                    <td className="px-3 py-2 text-navy/80">{row.warningRows}</td>
                    <td className="px-3 py-2 text-navy/80">{row.rejectedRows}</td>
                    <td className="px-3 py-2 text-xs text-navy/70">
                      {formatTime(row.importedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AttemptHistory({
  attempts,
}: {
  attempts: DeliveryDetailView["attempts"];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-navy/15 uppercase tracking-wide text-navy/60">
            <th scope="col" className="px-2 py-1.5">Attempt ref</th>
            <th scope="col" className="px-2 py-1.5">#</th>
            <th scope="col" className="px-2 py-1.5">Mode</th>
            <th scope="col" className="px-2 py-1.5">Outcome</th>
            <th scope="col" className="px-2 py-1.5">Intended</th>
            <th scope="col" className="px-2 py-1.5">Actual</th>
            <th scope="col" className="px-2 py-1.5">Provider</th>
            <th scope="col" className="px-2 py-1.5">Attempted</th>
            <th scope="col" className="px-2 py-1.5">Import</th>
            <th scope="col" className="px-2 py-1.5">Error</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((attempt) => (
            <tr key={attempt.attemptReference} className="border-b border-navy/10">
              <td className="px-2 py-1.5 font-mono text-navy">
                {attempt.attemptReference}
              </td>
              <td className="px-2 py-1.5 text-navy/80">{attempt.attemptNumber}</td>
              <td className="px-2 py-1.5 text-navy/80">{attempt.mode}</td>
              <td className="px-2 py-1.5 font-semibold text-navy">
                {attempt.displayOutcome}
              </td>
              <td className="px-2 py-1.5 text-navy/80">
                {attempt.intendedRecipient}
              </td>
              <td className="px-2 py-1.5 text-navy/80">
                {attempt.actualRecipient}
              </td>
              <td className="px-2 py-1.5 text-navy/80">{attempt.provider}</td>
              <td className="px-2 py-1.5 text-navy/70">
                {formatTime(attempt.attemptedAt)}
              </td>
              <td className="px-2 py-1.5 text-navy/70">
                {attempt.resultImportFile}
              </td>
              <td className="px-2 py-1.5 text-navy/70">
                {attempt.errorCode
                  ? `${attempt.errorCode}: ${attempt.errorMessage}`
                  : attempt.errorMessage || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
