"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  RESEND_VS_REPLACEMENT_TEXT,
  type DeliveryMode,
  type DeliveryPurpose,
} from "../constants";
import type {
  BatchRowView,
  ResultImportRowView,
} from "../read-service";

interface SourceBatch {
  id: string;
  code: string;
  status: string;
  readyCount: number;
  createdAt: string;
}

interface Props {
  sourceBatches: SourceBatch[];
  batches: BatchRowView[];
  resultImports: ResultImportRowView[];
  distributionConfigured: boolean;
  /** CHECKIN-10A deployment + event gate. False on development and preview. */
  productionAllowed: boolean;
  productionBlockedReason: string | null;
}

const PURPOSES: DeliveryPurpose[] = [
  "initial",
  "updated",
  "replacement",
  "resend",
];

type TabKey = "all" | "test" | "production" | "imports";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "all", label: "All batches" },
  { key: "test", label: "Test batches" },
  { key: "production", label: "Production batches" },
  { key: "imports", label: "Result imports" },
];

function ModeBadge({ mode }: { mode: DeliveryMode }) {
  const isTest = mode === "test";
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
        isTest ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"
      }`}
    >
      {isTest ? "Test" : "Production"}
    </span>
  );
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : "—";
}

export function DistributionWorkspace({
  sourceBatches,
  batches,
  resultImports,
  distributionConfigured,
  productionAllowed,
  productionBlockedReason,
}: Props) {
  const router = useRouter();
  const [documentBatchId, setDocumentBatchId] = useState(
    sourceBatches[0]?.id ?? ""
  );
  const [mode, setMode] = useState<DeliveryMode>("test");
  const [purpose, setPurpose] = useState<DeliveryPurpose>("initial");
  const [purposeReason, setPurposeReason] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");

  // A resend or replacement batch must carry a reason; the server enforces
  // this too, so a crafted request cannot skip it.
  const reasonRequired = purpose === "resend" || purpose === "replacement";
  // Production preparation is refused outright on development and preview.
  // The button is disabled here and the server refuses independently.
  const productionBlocked = mode === "production" && !productionAllowed;

  const visibleBatches = useMemo(() => {
    if (tab === "test") return batches.filter((b) => b.mode === "test");
    if (tab === "production") return batches.filter((b) => b.mode === "production");
    return batches;
  }, [batches, tab]);

  async function prepare() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/tickets/distribution/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentBatchId,
          mode,
          purpose,
          purposeReason,
          allowTestRecipientOverride: override,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const error = payload as { error?: { message?: string } };
        setMessage(error.error?.message ?? "Preparation failed.");
      } else {
        const data = payload as { preparedCount: number; excluded: unknown[] };
        setMessage(
          `Prepared ${data.preparedCount} deliveries. Excluded ${data.excluded.length}.`
        );
        router.refresh();
      }
    } catch {
      setMessage("Preparation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(batchId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/tickets/distribution/batches/${batchId}/cancel`,
        { method: "POST" }
      );
      if (!response.ok) {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        setMessage(payload.error?.message ?? "Cancel failed.");
      } else {
        setMessage("Batch cancelled.");
        router.refresh();
      }
    } catch {
      setMessage("Cancel failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      <section className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-navy">Prepare a delivery batch</h2>
        <p className="mt-1 text-sm text-navy/70">
          Select a completed PDF document batch. The app prepares and records
          deliveries; it never sends email. A test batch is never converted into
          a production batch.
        </p>
        <p className="mt-2 text-sm text-navy/70">{RESEND_VS_REPLACEMENT_TEXT}</p>
        {!productionAllowed && (
          <p
            className="mt-3 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-navy"
            data-testid="production-blocked-notice"
          >
            {productionBlockedReason ??
              "Production distribution is not available on this deployment."}
          </p>
        )}
        {!distributionConfigured && (
          <p className="mt-3 rounded-md border border-gold bg-gold/10 p-3 text-sm text-navy">
            TICKET_DISTRIBUTION_SECRET is not configured. Preparation is disabled
            until it is set on the server.
          </p>
        )}
        {sourceBatches.length === 0 ? (
          <p className="mt-3 text-sm text-navy/70">
            No completed document batches are available to distribute.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-navy">
              Document batch
              <select
                className="mt-1 w-full rounded-md border border-navy/20 p-2 text-sm"
                value={documentBatchId}
                onChange={(event) => setDocumentBatchId(event.target.value)}
              >
                {sourceBatches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.code} ({batch.readyCount} ready)
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-navy">
              Mode
              <select
                className="mt-1 w-full rounded-md border border-navy/20 p-2 text-sm"
                value={mode}
                onChange={(event) => setMode(event.target.value as DeliveryMode)}
              >
                <option value="test">test</option>
                <option value="production" disabled={!productionAllowed}>
                  production
                  {productionAllowed ? "" : " (unavailable on this deployment)"}
                </option>
              </select>
            </label>
            <label className="text-sm font-semibold text-navy">
              Purpose
              <select
                className="mt-1 w-full rounded-md border border-navy/20 p-2 text-sm"
                value={purpose}
                onChange={(event) =>
                  setPurpose(event.target.value as DeliveryPurpose)
                }
              >
                {PURPOSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2 text-sm font-semibold text-navy">
              <input
                type="checkbox"
                checked={override}
                onChange={(event) => setOverride(event.target.checked)}
              />
              Allow internal test-recipient override
            </label>
            {reasonRequired && (
              <label className="text-sm font-semibold text-navy sm:col-span-2">
                Reason for this {purpose} batch
                <input
                  type="text"
                  maxLength={500}
                  className="mt-1 w-full rounded-md border border-navy/20 p-2 text-sm"
                  value={purposeReason}
                  onChange={(event) => setPurposeReason(event.target.value)}
                  placeholder="Recorded in the audit history. Required."
                />
              </label>
            )}
          </div>
        )}
        <button
          type="button"
          disabled={
            busy ||
            !distributionConfigured ||
            sourceBatches.length === 0 ||
            productionBlocked ||
            (reasonRequired && purposeReason.trim().length === 0)
          }
          onClick={prepare}
          className="mt-4 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Prepare sending package
        </button>
        {message && (
          <p className="mt-3 text-sm text-navy/80" role="status">
            {message}
          </p>
        )}
      </section>

      <section>
        <div className="flex flex-wrap gap-1 border-b border-navy/15">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={`rounded-t-md px-4 py-2 text-sm font-semibold ${
                tab === entry.key
                  ? "border border-b-0 border-navy/15 bg-white text-navy"
                  : "text-navy/60 hover:text-navy"
              }`}
            >
              {entry.label}
              {entry.key === "imports" ? ` (${resultImports.length})` : ""}
            </button>
          ))}
        </div>

        {tab === "imports" ? (
          <ImportsTable imports={resultImports} />
        ) : (
          <BatchesTable
            batches={visibleBatches}
            busy={busy}
            onCancel={cancel}
          />
        )}
      </section>
    </div>
  );
}

function BatchesTable({
  batches,
  busy,
  onCancel,
}: {
  batches: BatchRowView[];
  busy: boolean;
  onCancel: (id: string) => void;
}) {
  if (batches.length === 0) {
    return (
      <p className="mt-3 text-sm text-navy/70">
        No batches to show in this view.
      </p>
    );
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-navy/15 text-xs uppercase tracking-wide text-navy/60">
            <th scope="col" className="px-3 py-2">Batch</th>
            <th scope="col" className="px-3 py-2">Event</th>
            <th scope="col" className="px-3 py-2">Mode</th>
            <th scope="col" className="px-3 py-2">Purpose</th>
            <th scope="col" className="px-3 py-2">Status</th>
            <th scope="col" className="px-3 py-2">Prepared</th>
            <th scope="col" className="px-3 py-2">Test sent</th>
            <th scope="col" className="px-3 py-2">Prod. sent</th>
            <th scope="col" className="px-3 py-2">Failed</th>
            <th scope="col" className="px-3 py-2">Created</th>
            <th scope="col" className="px-3 py-2">Last activity</th>
            <th scope="col" className="px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => (
            <tr key={batch.id} className="border-b border-navy/10 align-top">
              <td className="px-3 py-2 font-mono text-xs text-navy">
                {batch.code}
              </td>
              <td className="px-3 py-2 text-navy/80">{batch.eventCode}</td>
              <td className="px-3 py-2">
                <ModeBadge mode={batch.mode} />
              </td>
              <td className="px-3 py-2 text-navy/80">{batch.purpose}</td>
              <td className="px-3 py-2 text-navy/80">{batch.status}</td>
              <td className="px-3 py-2 text-navy/80">{batch.preparedCount}</td>
              <td className="px-3 py-2 text-navy/80">{batch.testSentCount}</td>
              <td className="px-3 py-2 text-navy/80">
                {batch.productionSentCount}
              </td>
              <td className="px-3 py-2 text-navy/80">{batch.failedCount}</td>
              <td className="px-3 py-2 text-xs text-navy/70">
                {formatTime(batch.createdAt)}
              </td>
              <td className="px-3 py-2 text-xs text-navy/70">
                {formatTime(batch.lastActivityAt)}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/tickets/distribution/${batch.code}`}
                    className="rounded border border-navy/20 px-2 py-1 text-xs font-semibold text-navy hover:border-navy/40"
                  >
                    View details
                  </Link>
                  <a
                    href={`/api/admin/tickets/distribution/batches/${batch.id}/send-queue`}
                    className="rounded border border-navy/20 px-2 py-1 text-xs font-semibold text-navy hover:border-navy/40"
                  >
                    Download queue
                  </a>
                  {(batch.status === "draft" ||
                    batch.status === "prepared") && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onCancel(batch.id)}
                      className="rounded border border-navy/20 px-2 py-1 text-xs font-semibold text-navy disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportsTable({ imports }: { imports: ResultImportRowView[] }) {
  if (imports.length === 0) {
    return (
      <p className="mt-3 text-sm text-navy/70">
        No result files have been imported yet.
      </p>
    );
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-navy/15 text-xs uppercase tracking-wide text-navy/60">
            <th scope="col" className="px-3 py-2">File</th>
            <th scope="col" className="px-3 py-2">Batch</th>
            <th scope="col" className="px-3 py-2">Status</th>
            <th scope="col" className="px-3 py-2">Total</th>
            <th scope="col" className="px-3 py-2">Accepted</th>
            <th scope="col" className="px-3 py-2">Duplicate</th>
            <th scope="col" className="px-3 py-2">Warning</th>
            <th scope="col" className="px-3 py-2">Rejected</th>
            <th scope="col" className="px-3 py-2">Imported by</th>
            <th scope="col" className="px-3 py-2">Imported</th>
            <th scope="col" className="px-3 py-2">Details</th>
          </tr>
        </thead>
        <tbody>
          {imports.map((row) => (
            <tr key={row.id} className="border-b border-navy/10">
              <td className="px-3 py-2 text-navy/80">{row.fileName}</td>
              <td className="px-3 py-2 font-mono text-xs text-navy">
                {row.batchCode}
              </td>
              <td className="px-3 py-2 text-navy/80">{row.status}</td>
              <td className="px-3 py-2 text-navy/80">{row.totalRows}</td>
              <td className="px-3 py-2 text-navy/80">{row.acceptedRows}</td>
              <td className="px-3 py-2 text-navy/80">{row.duplicateRows}</td>
              <td className="px-3 py-2 text-navy/80">{row.warningRows}</td>
              <td className="px-3 py-2 text-navy/80">{row.rejectedRows}</td>
              <td className="px-3 py-2 text-navy/80">{row.importedBy}</td>
              <td className="px-3 py-2 text-xs text-navy/70">
                {formatTime(row.importedAt)}
              </td>
              <td className="px-3 py-2">
                <Link
                  href={`/admin/tickets/distribution/import/${row.id}`}
                  className="rounded border border-navy/20 px-2 py-1 text-xs font-semibold text-navy hover:border-navy/40"
                >
                  View details
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
