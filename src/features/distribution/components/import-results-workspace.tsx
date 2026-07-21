"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface DeliveryBatchOption {
  id: string;
  code: string;
  mode: string;
  status: string;
}

interface EvaluatedRow {
  rowNumber: number;
  disposition: string;
  outcome: string | null;
  deliveryReference: string;
  message: string;
}

interface PreviewData {
  alreadyApplied: boolean;
  summary: {
    totalRows: number;
    acceptedRows: number;
    duplicateRows: number;
    warningRows: number;
    rejectedRows: number;
  };
  rows: EvaluatedRow[];
}

export function ImportResultsWorkspace({
  batches,
}: {
  batches: DeliveryBatchOption[];
}) {
  const router = useRouter();
  const [batchId, setBatchId] = useState(batches[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onFile(file: File | null) {
    if (file === null) {
      return;
    }
    setFileName(file.name);
    setCsv(await file.text());
    setPreview(null);
  }

  async function runPreview() {
    setBusy(true);
    setMessage(null);
    setPreview(null);
    try {
      const response = await fetch(
        "/api/admin/tickets/distribution/results/preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryBatchId: batchId, fileName, csv }),
        }
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        setMessage(
          (payload as { error?: { message?: string } }).error?.message ??
            "Preview failed."
        );
      } else {
        setPreview(payload as PreviewData);
      }
    } catch {
      setMessage("Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        "/api/admin/tickets/distribution/results/apply",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryBatchId: batchId, fileName, csv }),
        }
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        setMessage(
          (payload as { error?: { message?: string } }).error?.message ??
            "Apply failed."
        );
      } else {
        const data = payload as { alreadyApplied: boolean };
        setMessage(
          data.alreadyApplied
            ? "This results file was already applied; no new attempts were recorded."
            : "Results applied. Attempt history was appended."
        );
        router.refresh();
      }
    } catch {
      setMessage("Apply failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-navy">
            Delivery batch
            <select
              className="mt-1 w-full rounded-md border border-navy/20 p-2 text-sm"
              value={batchId}
              onChange={(event) => setBatchId(event.target.value)}
            >
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.code} ({batch.mode}, {batch.status})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-navy">
            Results CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="mt-1 w-full text-sm"
              onChange={(event) => onFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy || csv.length === 0 || batchId.length === 0}
            onClick={runPreview}
            className="rounded-md border border-navy/20 bg-white px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
          >
            Preview
          </button>
          <button
            type="button"
            disabled={busy || preview === null}
            onClick={apply}
            className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Apply results
          </button>
        </div>
        {message && (
          <p className="mt-3 text-sm text-navy/80" role="status">
            {message}
          </p>
        )}
      </section>

      {preview && (
        <section className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-navy">Preview</h2>
          {preview.alreadyApplied && (
            <p className="mt-1 rounded-md border border-gold bg-gold/10 p-2 text-sm text-navy">
              This exact file was already applied. Applying again is a no-op.
            </p>
          )}
          <p className="mt-2 text-sm text-navy/80">
            {preview.summary.totalRows} rows — {preview.summary.acceptedRows}{" "}
            accepted, {preview.summary.duplicateRows} duplicate,{" "}
            {preview.summary.warningRows} warning, {preview.summary.rejectedRows}{" "}
            rejected.
          </p>
          <div className="mt-3 max-h-96 overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-navy/15 uppercase tracking-wide text-navy/60">
                  <th scope="col" className="px-2 py-1">Row</th>
                  <th scope="col" className="px-2 py-1">Disposition</th>
                  <th scope="col" className="px-2 py-1">Outcome</th>
                  <th scope="col" className="px-2 py-1">Delivery reference</th>
                  <th scope="col" className="px-2 py-1">Message</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber} className="border-b border-navy/10">
                    <td className="px-2 py-1 text-navy/70">{row.rowNumber}</td>
                    <td className="px-2 py-1 text-navy/80">{row.disposition}</td>
                    <td className="px-2 py-1 text-navy/80">
                      {row.outcome ?? "—"}
                    </td>
                    <td className="px-2 py-1 font-mono text-navy/70">
                      {row.deliveryReference}
                    </td>
                    <td className="px-2 py-1 text-navy/70">{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
