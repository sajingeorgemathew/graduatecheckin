"use client";

/**
 * PDF Documents section for the existing administrator ticket detail page.
 *
 * This is additive: it sits below the existing web ticket preview and never
 * replaces or alters it. Preview and download both stream the exact stored
 * PDF bytes through an authenticated route, so what an administrator sees
 * is precisely what an export would ship.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { TicketDocumentSectionData } from "../read-service";

function formatBytes(size: number): string {
  return size < 1024 * 1024
    ? `${Math.round(size / 1024)} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value: string | null): string {
  return value === null ? "Not recorded" : new Date(value).toLocaleString("en-CA");
}

export function DocumentSection({
  data,
  canRegenerate,
}: {
  data: TicketDocumentSectionData;
  canRegenerate: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/ticket-documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: data.ticketId }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        setError(payload.error?.message ?? "The PDF could not be generated.");
        return;
      }
      router.refresh();
    } catch {
      setError("The PDF could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  const current = data.current;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-navy">PDF Documents</h2>

      {data.staleMessage !== null && (
        <p
          role="status"
          className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900"
        >
          {data.staleMessage}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <div className="mt-3 rounded-lg border border-navy/10 bg-white p-4 shadow-sm">
        {current === null ? (
          <p className="text-sm text-navy/75">
            No PDF has been generated for this ticket yet.
          </p>
        ) : (
          <dl className="space-y-1 text-sm text-navy">
            <div className="flex gap-2">
              <dt className="w-40 font-semibold">Current version</dt>
              <dd>V{current.documentVersion}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-40 font-semibold">Generated</dt>
              <dd>
                {formatTime(current.generatedAt)}
                {current.generatedByDisplayName === null
                  ? ""
                  : ` by ${current.generatedByDisplayName}`}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-40 font-semibold">Checksum</dt>
              <dd className="font-mono text-xs">{current.checksumShort}...</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-40 font-semibold">File</dt>
              <dd>
                {current.fileName} ({formatBytes(current.fileSizeBytes)})
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-40 font-semibold">Source state</dt>
              <dd>{current.isOutdated ? "Outdated" : "Current"}</dd>
            </div>
          </dl>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {current !== null && (
            <>
              <a
                href={`/api/admin/ticket-documents/${current.documentId}/file`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-navy/20 px-3 py-1.5 text-sm font-semibold text-navy"
              >
                Preview PDF
              </a>
              <a
                href={`/api/admin/ticket-documents/${current.documentId}/file?download=1`}
                className="rounded-md border border-navy/20 px-3 py-1.5 text-sm font-semibold text-navy"
              >
                Download PDF
              </a>
            </>
          )}
          {canRegenerate && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void regenerate()}
              className="rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-gold-light disabled:opacity-50"
            >
              {current === null ? "Generate PDF" : "Regenerate PDF"}
            </button>
          )}
        </div>
      </div>

      {data.history.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-navy/60">
            Document history
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-navy/15 text-xs uppercase tracking-wide text-navy/60">
                  <th scope="col" className="px-3 py-2">Version</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">Generated</th>
                  <th scope="col" className="px-3 py-2">Checksum</th>
                  <th scope="col" className="px-3 py-2">Invalidation</th>
                  <th scope="col" className="px-3 py-2">Preview</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((entry) => (
                  <tr key={entry.documentId} className="border-b border-navy/10">
                    <td className="px-3 py-2">V{entry.documentVersion}</td>
                    <td className="px-3 py-2 text-navy/80">{entry.status}</td>
                    <td className="px-3 py-2 text-navy/70">
                      {formatTime(entry.generatedAt)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-navy/70">
                      {entry.checksumShort}
                    </td>
                    <td className="px-3 py-2 text-navy/70">
                      {entry.invalidationReason ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={`/api/admin/ticket-documents/${entry.documentId}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-navy underline"
                      >
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
