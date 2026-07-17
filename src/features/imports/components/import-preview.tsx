"use client";

/**
 * Interactive import preview. Filtering and pagination happen on the
 * already-normalized preview rows, never by reparsing the workbook.
 * Phone numbers are masked in list views and full normalized values only
 * appear in the expandable detail panel. Secrets are never displayed.
 */

import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import type { RegistrationImportRow } from "@/types/database";
import {
  APPLY_CONFIRMATION_TEXT,
  CHILD_GROUP_NORMALIZATION_NOTICE,
  PREVIEW_PAGE_SIZE,
} from "../constants";
import { maskPhone } from "../summaries";
import type {
  MissingExistingRegistration,
  PreviewFilter,
  PreviewRow,
} from "../types";

interface ImportPreviewProps {
  importRecord: RegistrationImportRow;
  rows: PreviewRow[];
  missing: MissingExistingRegistration[];
}

const FILTERS: Array<{ id: PreviewFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "update", label: "Updates" },
  { id: "unchanged", label: "Unchanged" },
  { id: "warning", label: "Warnings" },
  { id: "error", label: "Errors" },
  { id: "failed", label: "Failed" },
  { id: "excluded", label: "Excluded" },
];

function matchesFilter(row: PreviewRow, filter: PreviewFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "new":
    case "update":
    case "unchanged":
      return (
        row.comparison_action === filter &&
        row.result !== "error" &&
        row.result !== "excluded"
      );
    case "warning":
      return row.result === "warning";
    case "error":
      return row.result === "error";
    case "failed":
      return row.registration_status === "failed";
    case "excluded":
      return row.result === "excluded";
  }
}

function actionLabel(row: PreviewRow): string {
  if (row.result === "error") {
    return "Error";
  }
  if (row.result === "excluded") {
    return "Excluded";
  }
  if (row.result === "applied") {
    return "Applied";
  }
  const base =
    row.comparison_action === "new"
      ? "New"
      : row.comparison_action === "update"
        ? "Update"
        : "Unchanged";
  return row.result === "warning" ? `${base} with warning` : base;
}

function money(value: number | null): string {
  if (value === null) {
    return "";
  }
  return `$${value.toFixed(2)}`;
}

export function ImportPreview({
  importRecord,
  rows,
  missing,
}: ImportPreviewProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<PreviewFilter>("all");
  const [page, setPage] = useState(1);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const editable = importRecord.status === "preview_ready";

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesFilter(row, filter)),
    [rows, filter]
  );

  const pageCount = Math.max(
    1,
    Math.ceil(filteredRows.length / PREVIEW_PAGE_SIZE)
  );
  const safePage = Math.min(page, pageCount);
  const pagedRows = filteredRows.slice(
    (safePage - 1) * PREVIEW_PAGE_SIZE,
    safePage * PREVIEW_PAGE_SIZE
  );

  const summaryCards = [
    { label: "Total rows", value: importRecord.total_rows },
    { label: "New", value: importRecord.new_rows },
    { label: "Updates", value: importRecord.updated_rows },
    { label: "Unchanged", value: importRecord.unchanged_rows },
    { label: "Warnings", value: importRecord.warning_rows },
    { label: "Errors", value: importRecord.error_rows },
    { label: "Missing from upload", value: importRecord.missing_existing_rows },
  ];

  async function readErrorMessage(response: Response): Promise<string> {
    try {
      const payload: unknown = await response.json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload
      ) {
        const err = (payload as { error: { message?: unknown } }).error;
        if (typeof err?.message === "string") {
          return err.message;
        }
      }
    } catch {
      // Fall through to the generic message.
    }
    return "The request failed.";
  }

  async function toggleRow(row: PreviewRow, include: boolean) {
    if (busyRowId !== null) {
      return;
    }
    setBusyRowId(row.id);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/imports/${importRecord.id}/rows/${row.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ include }),
        }
      );
      if (!response.ok) {
        setMessage(await readErrorMessage(response));
        return;
      }
      router.refresh();
    } catch {
      setMessage("The request failed.");
    } finally {
      setBusyRowId(null);
    }
  }

  async function cancelImport() {
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/imports/${importRecord.id}/cancel`,
        { method: "POST" }
      );
      if (!response.ok) {
        setMessage(await readErrorMessage(response));
        return;
      }
      router.refresh();
    } catch {
      setMessage("The request failed.");
    }
  }

  async function applyImport() {
    if (applying || confirmationText !== APPLY_CONFIRMATION_TEXT) {
      return;
    }
    setApplying(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/imports/${importRecord.id}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation: confirmationText,
            idempotencyKey,
          }),
        }
      );
      if (!response.ok) {
        setMessage(await readErrorMessage(response));
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setMessage("The request failed.");
    } finally {
      setApplying(false);
    }
  }

  const detailRow = (label: string, value: string | number | null) => (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="w-44 shrink-0 font-semibold text-navy/80">{label}</span>
      <span className="break-words text-navy">
        {value === null || value === "" ? "-" : value}
      </span>
    </div>
  );

  const renderIssues = (row: PreviewRow) => {
    const issues = [...row.validation_errors, ...row.validation_warnings];
    if (issues.length === 0) {
      return <span className="text-navy/50">None</span>;
    }
    return (
      <ul className="list-disc space-y-0.5 pl-4">
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${index}`}>{issue.message}</li>
        ))}
      </ul>
    );
  };

  const rowActions = (row: PreviewRow) => {
    if (!editable) {
      return null;
    }
    const busy = busyRowId === row.id;
    if (row.result === "excluded") {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => toggleRow(row, true)}
          className="rounded-md border border-navy px-2 py-1 text-xs font-semibold text-navy hover:bg-navy hover:text-gold-light disabled:opacity-50"
        >
          Include row
        </button>
      );
    }
    if (row.result !== "error") {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => toggleRow(row, false)}
          className="rounded-md border border-navy/40 px-2 py-1 text-xs font-semibold text-navy/80 hover:bg-navy hover:text-gold-light disabled:opacity-50"
        >
          Exclude row
        </button>
      );
    }
    return null;
  };

  const expandedPanel = (row: PreviewRow) => (
    <div className="space-y-1.5 rounded-md bg-cream p-4 text-sm">
      {detailRow("Order ID", row.source_registration_id)}
      {detailRow("Graduate", row.graduate_full_name)}
      {detailRow("Email", row.email)}
      {detailRow("Phone (full)", row.phone)}
      {detailRow("Gown size", row.gown_size)}
      {detailRow("Pronunciation", row.name_pronunciation)}
      {detailRow("Guest 1", row.guest_1_name)}
      {detailRow("Guest 2", row.guest_2_name)}
      {detailRow("Adult guests", row.registered_adult_guests)}
      {detailRow("Children 0 to 4", row.registered_children_0_4)}
      {detailRow("Children 5 to 10", row.registered_children_5_10)}
      {detailRow("Expected party size", row.expected_party_size)}
      {detailRow("Source status", row.source_order_status)}
      {detailRow("Registration status", row.registration_status)}
      {detailRow("Payment status", row.payment_status)}
      {detailRow("Fee total", money(row.fee_total))}
      {detailRow("Tax total", money(row.tax_total))}
      {detailRow("Order total", money(row.order_total))}
      {detailRow("Order date", row.source_order_date)}
      <div className="pt-1">
        <span className="font-semibold text-navy/80">Issues</span>
        <div className="mt-1 text-navy/80">{renderIssues(row)}</div>
      </div>
    </div>
  );

  return (
    <div>
      <section aria-label="Import summary">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-navy/10 bg-white p-4 text-center shadow-sm"
            >
              <p className="text-2xl font-bold text-navy">{card.value}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-navy/60">
                {card.label}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-md border border-navy/10 bg-white p-3 text-xs text-navy/70">
          {CHILD_GROUP_NORMALIZATION_NOTICE} Failed source orders stay
          visible and clearly marked, and are excluded from eligible ticket
          processing.
        </p>
      </section>

      {message !== null && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {message}
        </p>
      )}

      <section aria-label="Preview rows" className="mt-6">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setFilter(entry.id);
                setPage(1);
              }}
              className={
                filter === entry.id
                  ? "rounded-full bg-navy px-3 py-1 text-xs font-semibold text-gold-light"
                  : "rounded-full border border-navy/20 bg-white px-3 py-1 text-xs font-semibold text-navy/70 hover:border-navy"
              }
            >
              {entry.label}
            </button>
          ))}
        </div>

        {/* Desktop table view */}
        <div className="mt-4 hidden overflow-x-auto rounded-lg border border-navy/10 bg-white shadow-sm lg:block">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-navy text-gold-light">
              <tr>
                <th className="px-3 py-2 font-semibold">Row</th>
                <th className="px-3 py-2 font-semibold">Order ID</th>
                <th className="px-3 py-2 font-semibold">Graduate</th>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">Phone</th>
                <th className="px-3 py-2 text-right font-semibold">Adults</th>
                <th className="px-3 py-2 text-right font-semibold">
                  Children 0 to 4
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  Children 5 to 10
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  Party size
                </th>
                <th className="px-3 py-2 font-semibold">Source status</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                <th className="px-3 py-2 font-semibold">Action</th>
                <th className="px-3 py-2 font-semibold">Issues</th>
                <th className="px-3 py-2 font-semibold">
                  <span className="sr-only">Row actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/10 text-navy">
              {pagedRows.map((row) => (
                <Fragment key={row.id}>
                  <tr>
                    <td className="px-3 py-2">{row.source_row_number}</td>
                    <td className="px-3 py-2">{row.source_registration_id}</td>
                    <td className="max-w-[180px] truncate px-3 py-2">
                      {row.graduate_full_name}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2">
                      {row.email}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {maskPhone(row.phone)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.registered_adult_guests}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.registered_children_0_4}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.registered_children_5_10}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.expected_party_size}
                    </td>
                    <td className="px-3 py-2">{row.source_order_status}</td>
                    <td className="px-3 py-2 text-right">
                      {money(row.order_total)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold">
                      {actionLabel(row)}
                    </td>
                    <td className="px-3 py-2 text-xs text-navy/70">
                      {row.validation_errors.length +
                        row.validation_warnings.length}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRowId(
                              expandedRowId === row.id ? null : row.id
                            )
                          }
                          className="rounded-md border border-navy/40 px-2 py-1 text-xs font-semibold text-navy/80 hover:bg-navy hover:text-gold-light"
                        >
                          {expandedRowId === row.id ? "Hide" : "View details"}
                        </button>
                        {rowActions(row)}
                      </div>
                    </td>
                  </tr>
                  {expandedRowId === row.id && (
                    <tr>
                      <td colSpan={14} className="px-3 py-3">
                        {expandedPanel(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked-card view */}
        <div className="mt-4 space-y-3 lg:hidden">
          {pagedRows.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-navy">
                  Row {row.source_row_number}: {row.graduate_full_name ?? "-"}
                </p>
                <span className="whitespace-nowrap text-xs font-semibold text-navy/70">
                  {actionLabel(row)}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-navy/80">
                <dt className="font-semibold">Order ID</dt>
                <dd>{row.source_registration_id ?? "-"}</dd>
                <dt className="font-semibold">Phone</dt>
                <dd>{maskPhone(row.phone) || "-"}</dd>
                <dt className="font-semibold">Party size</dt>
                <dd>{row.expected_party_size}</dd>
                <dt className="font-semibold">Amount</dt>
                <dd>{money(row.order_total) || "-"}</dd>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedRowId(expandedRowId === row.id ? null : row.id)
                  }
                  className="rounded-md border border-navy/40 px-2 py-1 text-xs font-semibold text-navy/80"
                >
                  {expandedRowId === row.id ? "Hide" : "View details"}
                </button>
                {rowActions(row)}
              </div>
              {expandedRowId === row.id && (
                <div className="mt-3">{expandedPanel(row)}</div>
              )}
            </div>
          ))}
        </div>

        {filteredRows.length === 0 && (
          <p className="mt-4 rounded-lg border border-navy/10 bg-white p-4 text-sm text-navy/70">
            No rows match this filter.
          </p>
        )}

        {pageCount > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-navy">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              className="rounded-md border border-navy/30 px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {safePage} of {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
              className="rounded-md border border-navy/30 px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </section>

      <section aria-label="Missing registrations" className="mt-8">
        <h2 className="text-lg font-semibold text-navy">
          Missing from uploaded file
        </h2>
        <p className="mt-1 text-sm text-navy/70">
          These existing registrations were not present in the uploaded
          workbook. No automatic action will occur: they are never deleted,
          cancelled or changed and tickets are never revoked.
        </p>
        {missing.length === 0 ? (
          <p className="mt-3 rounded-lg border border-navy/10 bg-white p-4 text-sm text-navy/70">
            Every existing registration for this event appears in the upload.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-navy/10 rounded-lg border border-navy/10 bg-white shadow-sm">
            {missing.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-navy"
              >
                <span>{entry.graduate_full_name}</span>
                <span className="text-navy/60">
                  Order {entry.source_registration_id}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sticky action area */}
      {editable && (
        <div className="sticky bottom-0 mt-8 border-t border-navy/10 bg-white/95 p-4 shadow-lg backdrop-blur">
          {!confirming ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-navy/70">
                Rows with errors are automatically excluded. Warning rows
                stay included unless excluded above.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelImport}
                  className="rounded-md border border-navy/40 px-4 py-2 text-sm font-semibold text-navy hover:bg-cream"
                >
                  Cancel import
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-gold-light hover:bg-navy-light"
                >
                  Apply approved rows
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-navy">Confirm application</p>
              <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-navy/80 sm:grid-cols-3">
                <li>New rows: {importRecord.new_rows}</li>
                <li>Updates: {importRecord.updated_rows}</li>
                <li>Unchanged rows: {importRecord.unchanged_rows}</li>
                <li>Warnings: {importRecord.warning_rows}</li>
                <li>Errors excluded: {importRecord.error_rows}</li>
                <li>
                  Missing from upload: {importRecord.missing_existing_rows}
                </li>
              </ul>
              <label
                htmlFor="apply-confirmation"
                className="mt-3 block text-sm text-navy/80"
              >
                Type {APPLY_CONFIRMATION_TEXT} to continue.
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="apply-confirmation"
                  type="text"
                  value={confirmationText}
                  onChange={(event) => setConfirmationText(event.target.value)}
                  className="rounded-md border border-navy/30 px-3 py-2 text-sm text-navy sm:w-64"
                  placeholder={APPLY_CONFIRMATION_TEXT}
                  autoComplete="off"
                />
                <button
                  type="button"
                  disabled={
                    applying || confirmationText !== APPLY_CONFIRMATION_TEXT
                  }
                  onClick={applyImport}
                  className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-gold-light hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {applying ? "Applying..." : "Apply import"}
                </button>
                <button
                  type="button"
                  disabled={applying}
                  onClick={() => {
                    setConfirming(false);
                    setConfirmationText("");
                  }}
                  className="rounded-md border border-navy/40 px-4 py-2 text-sm font-semibold text-navy hover:bg-cream"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {importRecord.status === "applied" && (
        <p className="mt-8 rounded-lg border border-gold bg-white p-4 text-sm text-navy">
          This import has been applied and can no longer be edited or
          reapplied. Existing registration IDs, tickets and check-in history
          were preserved.
        </p>
      )}
    </div>
  );
}
