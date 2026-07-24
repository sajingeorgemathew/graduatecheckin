"use client";

/**
 * The Manual Delivery Desk list.
 *
 * Search and filters are driven through the URL so a reload, a bookmark and
 * the browser back button all keep the administrator where they were while
 * working through a hundred and eighty graduates one at a time.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  MANUAL_DELIVERY_FILTERS,
  MANUAL_DELIVERY_FILTER_LABELS,
} from "../constants";
import type {
  DeliveryState,
  ManualDeliveryDeskData,
  ManualDeliveryRow,
} from "../types";

const STATE_LABELS: Record<DeliveryState, string> = {
  ready_to_send: "Ready to send",
  ticket_missing: "Ticket missing",
  pdf_missing: "PDF missing",
  pdf_outdated: "PDF outdated",
  email_missing: "Email missing",
  manually_sent: "Manually sent",
  resent: "Resent",
  needs_reconciliation: "Needs reconciliation",
};

const STATE_STYLES: Record<DeliveryState, string> = {
  ready_to_send: "bg-navy text-gold-light",
  ticket_missing: "bg-red-100 text-red-800",
  pdf_missing: "bg-red-100 text-red-800",
  pdf_outdated: "bg-gold text-navy",
  email_missing: "bg-red-100 text-red-800",
  manually_sent: "bg-green-100 text-green-900",
  resent: "bg-green-100 text-green-900",
  needs_reconciliation: "bg-gold text-navy",
};

function formatTimestamp(value: string | null): string {
  if (value === null) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("en-CA", { timeZone: "America/Toronto" });
}

function DeskRow({ row }: { row: ManualDeliveryRow }) {
  return (
    <tr className="border-b border-navy/5 align-top">
      <td className="py-3 pr-3">
        <Link
          href={`/admin/tickets/manual-delivery/${row.registrationId}`}
          className="font-semibold text-navy underline hover:text-navy-light"
        >
          {row.graduateName}
        </Link>
        <div className="mt-0.5 text-xs text-navy/60">
          {row.email ?? "no email"}
          {row.phone !== null && ` · ${row.phone}`}
        </div>
      </td>
      <td className="py-3 pr-3 text-xs">
        <div>{row.approvedPartySize} in party</div>
        <div className="text-navy/60">
          {row.approvedAdultGuests} adult · {row.approvedChildren04} aged 0-4
          {" · "}
          {row.approvedChildren510} aged 5-10
        </div>
      </td>
      <td className="py-3 pr-3 font-mono text-xs">{row.ticketCode ?? "-"}</td>
      <td className="py-3 pr-3 font-mono text-[11px] break-all">
        {row.pdfFileName ?? "-"}
      </td>
      <td className="py-3 pr-3">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATE_STYLES[row.state]}`}
        >
          {STATE_LABELS[row.state]}
        </span>
        {row.sendCount > 0 && (
          <div className="mt-1 text-[11px] text-navy/60">
            {row.sendCount} recorded send{row.sendCount === 1 ? "" : "s"}
          </div>
        )}
        {row.partyUpdatedSinceLastSend && (
          <div className="mt-1 text-[11px] font-semibold text-navy">
            {row.resendRecommended
              ? "Updated PDF ready - resend recommended"
              : "Party updated since last send"}
          </div>
        )}
      </td>
      <td className="py-3 pr-3 text-xs">{formatTimestamp(row.lastSentAt)}</td>
      <td className="py-3 text-xs">
        {row.checkedIn ? "Checked in" : "Not checked in"}
      </td>
    </tr>
  );
}

export function DeliveryDesk({ data }: { data: ManualDeliveryDeskData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(data.search);
  const [generating, setGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<string | null>(
    null
  );

  function navigate(next: { filter?: string; search?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.filter !== undefined) {
      params.set("filter", next.filter);
    }
    if (next.search !== undefined) {
      if (next.search.length === 0) {
        params.delete("search");
      } else {
        params.set("search", next.search);
      }
    }
    router.push(`/admin/tickets/manual-delivery?${params.toString()}`);
  }

  async function generateMissing() {
    if (generating) {
      return;
    }
    setGenerating(true);
    setGenerationMessage(null);
    try {
      const response = await fetch("/api/admin/tickets/generate-missing", {
        method: "POST",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setGenerationMessage(
          "Generation failed. No ticket or PDF was changed."
        );
        return;
      }
      const summary = payload as {
        ticketsGenerated: number;
        pdfsGenerated: number;
        pdfsFailed: number;
      };
      setGenerationMessage(
        `Generated ${summary.ticketsGenerated} ticket(s) and ` +
          `${summary.pdfsGenerated} PDF(s). ${summary.pdfsFailed} PDF(s) failed. ` +
          "Existing valid tickets and current PDFs were left untouched."
      );
      router.refresh();
    } catch {
      setGenerationMessage("Generation failed. Nothing was changed.");
    } finally {
      setGenerating(false);
    }
  }

  const summary = data.summary;
  const cards = [
    ["Graduates", summary.totalGraduates],
    ["Ready to send", summary.readyToSend],
    ["Manually sent", summary.manuallySent],
    ["Resent", summary.resent],
    ["Ticket missing", summary.ticketMissing],
    ["PDF missing", summary.pdfMissing],
    ["PDF outdated", summary.pdfOutdated],
    ["Checked in", summary.checkedIn],
  ] as const;

  return (
    <div className="space-y-5">
      {data.logoWarning !== null && (
        <p
          role="status"
          className="rounded-md border border-gold bg-cream p-3 text-sm text-navy"
        >
          {data.logoWarning}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {cards.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-navy/10 bg-white p-3 shadow-sm"
          >
            <p className="text-xl font-bold text-navy">{value}</p>
            <p className="mt-0.5 text-[11px] text-navy/70">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={generateMissing}
          disabled={generating}
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-gold-light hover:bg-navy-light disabled:opacity-60"
        >
          {generating ? "Generating..." : "Generate missing tickets"}
        </button>
        <Link
          href="/admin/registrations/new"
          className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light"
        >
          Add a graduate or walk-in
        </Link>
        <Link
          href="/admin/tickets/documents"
          className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light"
        >
          PDF documents and ZIP export
        </Link>
      </div>

      {generationMessage !== null && (
        <p
          role="status"
          className="rounded-md border border-navy/15 bg-white p-3 text-sm text-navy"
        >
          {generationMessage}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ search });
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, phone, order ID or ticket code"
          className="w-full max-w-md rounded-md border border-navy/20 bg-white p-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {MANUAL_DELIVERY_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => navigate({ filter })}
            className={
              filter === data.filter
                ? "rounded-full bg-navy px-3 py-1 text-xs font-semibold text-gold-light"
                : "rounded-full border border-navy/20 px-3 py-1 text-xs font-semibold text-navy hover:bg-navy/5"
            }
          >
            {MANUAL_DELIVERY_FILTER_LABELS[filter]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-navy/10 bg-white shadow-sm">
        <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-navy/15 text-xs text-navy/70">
              <th className="p-3 font-semibold">Graduate</th>
              <th className="p-3 font-semibold">Approved party</th>
              <th className="p-3 font-semibold">Ticket code</th>
              <th className="p-3 font-semibold">PDF file name</th>
              <th className="p-3 font-semibold">Delivery</th>
              <th className="p-3 font-semibold">Last sent</th>
              <th className="p-3 font-semibold">Check-in</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <DeskRow key={row.registrationId} row={row} />
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 && (
          <p className="p-6 text-sm text-navy/70">
            No graduate matches this filter and search.
          </p>
        )}
      </div>
    </div>
  );
}
