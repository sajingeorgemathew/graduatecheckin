"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DeliveryMode, DeliveryPurpose } from "../constants";

interface SourceBatch {
  id: string;
  code: string;
  status: string;
  readyCount: number;
  createdAt: string;
}

interface DeliveryBatch {
  id: string;
  code: string;
  mode: DeliveryMode;
  purpose: DeliveryPurpose;
  status: string;
  preparedCount: number;
  sentCount: number;
  createdAt: string;
}

interface Props {
  sourceBatches: SourceBatch[];
  deliveryBatches: DeliveryBatch[];
  distributionConfigured: boolean;
}

const PURPOSES: DeliveryPurpose[] = [
  "initial",
  "updated",
  "replacement",
  "resend",
];

export function DistributionWorkspace({
  sourceBatches,
  deliveryBatches,
  distributionConfigured,
}: Props) {
  const router = useRouter();
  const [documentBatchId, setDocumentBatchId] = useState(
    sourceBatches[0]?.id ?? ""
  );
  const [mode, setMode] = useState<DeliveryMode>("test");
  const [purpose, setPurpose] = useState<DeliveryPurpose>("initial");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
          deliveries; it never sends email.
        </p>
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
                onChange={(event) =>
                  setMode(event.target.value as DeliveryMode)
                }
              >
                <option value="test">test</option>
                <option value="production">production</option>
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
          </div>
        )}
        <button
          type="button"
          disabled={busy || !distributionConfigured || sourceBatches.length === 0}
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
        <h2 className="text-lg font-bold text-navy">Delivery batches</h2>
        {deliveryBatches.length === 0 ? (
          <p className="mt-2 text-sm text-navy/70">
            No delivery batches have been prepared yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-navy/15 text-xs uppercase tracking-wide text-navy/60">
                  <th scope="col" className="px-3 py-2">Code</th>
                  <th scope="col" className="px-3 py-2">Mode</th>
                  <th scope="col" className="px-3 py-2">Purpose</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">Prepared</th>
                  <th scope="col" className="px-3 py-2">Sent</th>
                  <th scope="col" className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deliveryBatches.map((batch) => (
                  <tr key={batch.id} className="border-b border-navy/10">
                    <td className="px-3 py-2 font-mono text-xs text-navy">
                      {batch.code}
                    </td>
                    <td className="px-3 py-2 text-navy/80">{batch.mode}</td>
                    <td className="px-3 py-2 text-navy/80">{batch.purpose}</td>
                    <td className="px-3 py-2 text-navy/80">{batch.status}</td>
                    <td className="px-3 py-2 text-navy/80">
                      {batch.preparedCount}
                    </td>
                    <td className="px-3 py-2 text-navy/80">{batch.sentCount}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <a
                          href={`/api/admin/tickets/distribution/batches/${batch.id}/send-queue`}
                          className="rounded border border-navy/20 px-2 py-1 text-xs font-semibold text-navy"
                        >
                          Send queue CSV
                        </a>
                        {(batch.status === "draft" ||
                          batch.status === "prepared") && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => cancel(batch.id)}
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
        )}
      </section>
    </div>
  );
}
