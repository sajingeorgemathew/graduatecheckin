"use client";

/**
 * Interactive administration surface for branded PDF tickets.
 *
 * Nothing is generated or exported when this component mounts: every
 * expensive action is an explicit button press, and bulk generation and
 * batch creation both require typed confirmation first.
 *
 * Bulk generation runs in bounded chunks and reports each item
 * individually, so one failure never discards the documents that already
 * succeeded and an interrupted run can simply be resumed.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  CREATE_BATCH_CONFIRMATION_TEXT,
  EXPORT_BATCH_DEFAULT_SIZE,
  EXPORT_BATCH_MAX_SIZE,
  GENERATE_DOCUMENTS_CONFIRMATION_TEXT,
  GENERATION_CHUNK_SIZE,
} from "../constants";
import type {
  TicketDocumentGenerationItemResult,
  TicketDocumentListRow,
} from "../types";

interface WorkspaceProps {
  rows: TicketDocumentListRow[];
}

const STATE_LABELS: Record<TicketDocumentListRow["state"], string> = {
  missing: "Missing PDF",
  current: "Current",
  outdated: "Outdated",
  superseded: "Superseded",
  invalidated: "Invalidated",
  failed: "Generation failed",
};

const STATE_CLASSES: Record<TicketDocumentListRow["state"], string> = {
  missing: "bg-navy/10 text-navy",
  current: "bg-emerald-100 text-emerald-900",
  outdated: "bg-amber-100 text-amber-900",
  superseded: "bg-navy/10 text-navy/70",
  invalidated: "bg-red-100 text-red-900",
  failed: "bg-red-100 text-red-900",
};

function chunk<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

export function DocumentWorkspace({ rows }: WorkspaceProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<
    TicketDocumentGenerationItemResult[] | null
  >(null);

  const selectableRows = useMemo(
    () => rows.filter((row) => row.ticketId !== null),
    [rows]
  );

  function toggle(registrationId: string): void {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(registrationId)) {
        next.delete(registrationId);
      } else {
        next.add(registrationId);
      }
      return next;
    });
  }

  function selectedRows(): TicketDocumentListRow[] {
    return selectableRows.filter((row) => selected.has(row.registrationId));
  }

  /** Generates in bounded chunks so no single request is unbounded. */
  async function runGeneration(
    ticketIds: string[],
    requireConfirmation: boolean
  ): Promise<void> {
    if (ticketIds.length === 0) {
      setError("Select at least one registration.");
      return;
    }
    if (requireConfirmation) {
      const typed = window.prompt(
        `Generating ${ticketIds.length} PDF document(s).\n` +
          `Type ${GENERATE_DOCUMENTS_CONFIRMATION_TEXT} to confirm.`
      );
      if (typed !== GENERATE_DOCUMENTS_CONFIRMATION_TEXT) {
        return;
      }
    }

    setBusy(true);
    setError(null);
    setResults(null);
    const collected: TicketDocumentGenerationItemResult[] = [];
    const chunks = chunk(ticketIds, GENERATION_CHUNK_SIZE);

    try {
      for (const [index, part] of chunks.entries()) {
        setProgress(`Generating chunk ${index + 1} of ${chunks.length}...`);
        const body =
          part.length === 1 && !requireConfirmation
            ? { ticketId: part[0] }
            : {
                ticketIds: part,
                confirmationText: GENERATE_DOCUMENTS_CONFIRMATION_TEXT,
              };
        const response = await fetch("/api/admin/ticket-documents/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload
              ? String(
                  (payload as { error: { message?: string } }).error.message ??
                    "Generation failed."
                )
              : "Generation failed.";
          setError(message);
          break;
        }
        const parsed = payload as {
          results?: TicketDocumentGenerationItemResult[];
        };
        collected.push(...(parsed.results ?? []));
      }
      setResults(collected);
      router.refresh();
    } catch {
      setError("Generation failed. No further documents were created.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function createBatch(): Promise<void> {
    const eligible = selectedRows().filter((row) => row.readyForExport);
    if (eligible.length === 0) {
      setError(
        "Select registrations that have a current PDF and a recipient email."
      );
      return;
    }
    if (eligible.length > EXPORT_BATCH_MAX_SIZE) {
      setError(`An export batch holds at most ${EXPORT_BATCH_MAX_SIZE}.`);
      return;
    }
    const typed = window.prompt(
      `Creating an export batch of ${eligible.length} registration(s).\n` +
        `Type ${CREATE_BATCH_CONFIRMATION_TEXT} to confirm.`
    );
    if (typed !== CREATE_BATCH_CONFIRMATION_TEXT) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/ticket-documents/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationIds: eligible.map((row) => row.registrationId),
          purpose: "initial",
          confirmationText: CREATE_BATCH_CONFIRMATION_TEXT,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        setError(payload.error?.message ?? "The export batch was not created.");
        return;
      }
      setSelected(new Set());
      router.refresh();
    } catch {
      setError("The export batch was not created.");
    } finally {
      setBusy(false);
    }
  }

  const missingTicketIds = selectableRows
    .filter((row) => row.state === "missing")
    .map((row) => row.ticketId as string);
  const outdatedTicketIds = selectableRows
    .filter((row) => row.state === "outdated")
    .map((row) => row.ticketId as string);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() =>
            void runGeneration(
              selectedRows().map((row) => row.ticketId as string),
              true
            )
          }
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-gold-light disabled:opacity-50"
        >
          Generate selected ({selected.size})
        </button>
        <button
          type="button"
          disabled={busy || missingTicketIds.length === 0}
          onClick={() => void runGeneration(missingTicketIds, true)}
          className="rounded-md border border-navy/20 bg-white px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
        >
          Generate all missing ({missingTicketIds.length})
        </button>
        <button
          type="button"
          disabled={busy || outdatedTicketIds.length === 0}
          onClick={() => void runGeneration(outdatedTicketIds, true)}
          className="rounded-md border border-navy/20 bg-white px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
        >
          Regenerate outdated ({outdatedTicketIds.length})
        </button>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => void createBatch()}
          className="rounded-md border border-gold bg-white px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
        >
          Create export batch
        </button>
      </div>
      <p className="mt-2 text-xs text-navy/60">
        Batches default to {EXPORT_BATCH_DEFAULT_SIZE} and hold at most{" "}
        {EXPORT_BATCH_MAX_SIZE} registrations. Generation runs in chunks of{" "}
        {GENERATION_CHUNK_SIZE} and can be resumed.
      </p>

      {progress !== null && (
        <p role="status" className="mt-3 text-sm text-navy">
          {progress}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      {results !== null && (
        <div className="mt-3 rounded-md border border-navy/15 bg-white p-3 text-sm">
          <p className="font-semibold text-navy">
            {results.filter((item) => item.ok).length} generated,{" "}
            {results.filter((item) => !item.ok).length} failed
          </p>
          <ul className="mt-2 space-y-1">
            {results
              .filter(
                (item): item is Extract<typeof item, { ok: false }> => !item.ok
              )
              .map((item) => (
                <li key={item.ticketId ?? item.registrationId} className="text-red-700">
                  {item.message}
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-navy/15 text-xs uppercase tracking-wide text-navy/60">
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Select</span>
              </th>
              <th scope="col" className="px-3 py-2">Graduate</th>
              <th scope="col" className="px-3 py-2">Ticket code</th>
              <th scope="col" className="px-3 py-2">Party</th>
              <th scope="col" className="px-3 py-2">State</th>
              <th scope="col" className="px-3 py-2">Version</th>
              <th scope="col" className="px-3 py-2">Email</th>
              <th scope="col" className="px-3 py-2">Batch</th>
              <th scope="col" className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-navy/70">
                  No registrations match this filter.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.registrationId}
                className="border-b border-navy/10 align-middle"
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(row.registrationId)}
                    onChange={() => toggle(row.registrationId)}
                    aria-label={`Select ${row.graduateName}`}
                  />
                </td>
                <td className="px-3 py-2 font-medium text-navy">
                  {row.graduateName}
                  {row.isTest && (
                    <span className="ml-2 rounded bg-navy/10 px-1.5 py-0.5 text-xs text-navy/70">
                      test
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-navy/80">
                  {row.ticketCode ?? "-"}
                </td>
                <td className="px-3 py-2 text-navy/80">{row.partySize}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${STATE_CLASSES[row.state]}`}
                  >
                    {STATE_LABELS[row.state]}
                  </span>
                </td>
                <td className="px-3 py-2 text-navy/80">
                  {row.documentVersion === null ? "-" : `V${row.documentVersion}`}
                </td>
                <td className="px-3 py-2 text-navy/80">
                  {row.hasRecipientEmail ? "Yes" : "Missing"}
                </td>
                <td className="px-3 py-2 text-navy/80">
                  {row.inExportBatch ? "In batch" : "-"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || row.ticketId === null}
                      onClick={() =>
                        void runGeneration([row.ticketId as string], false)
                      }
                      className="rounded border border-navy/20 px-2 py-1 text-xs font-semibold text-navy disabled:opacity-50"
                    >
                      {row.state === "missing" ? "Generate" : "Regenerate"}
                    </button>
                    {row.ticketId !== null && (
                      <a
                        href={`/admin/tickets/${row.ticketId}`}
                        className="rounded border border-navy/20 px-2 py-1 text-xs font-semibold text-navy"
                      >
                        Open ticket
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
