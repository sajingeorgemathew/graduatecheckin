"use client";

/**
 * Bulk-generation candidate selection. Only eligible registrations
 * without an active ticket are selectable. The browser sends registration
 * IDs, the server-issued idempotency key and the typed confirmation text
 * only; ticket IDs, codes, tokens and hashes are all generated
 * server-side, and eligibility is rechecked there at submission.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  GENERATE_CONFIRMATION_TEXT,
  TICKETS_PAGE_SIZE,
} from "@/features/tickets/constants";
import type { GenerationCandidate } from "@/features/tickets/types";

interface GenerationPreviewFormProps {
  candidates: GenerationCandidate[];
  /** Server-generated key so double submission returns the same batch. */
  idempotencyKey: string;
}

function errorMessageFrom(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error: { message?: unknown } }).error?.message ===
      "string"
  ) {
    return (payload as { error: { message: string } }).error.message;
  }
  return "The ticket generation failed.";
}

export function GenerationPreviewForm({
  candidates,
  idempotencyKey,
}: GenerationPreviewFormProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term.length === 0) {
      return candidates;
    }
    return candidates.filter(
      (candidate) =>
        candidate.graduateName.toLowerCase().includes(term) ||
        (candidate.sourceRegistrationId !== null &&
          candidate.sourceRegistrationId.toLowerCase().includes(term))
    );
  }, [candidates, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / TICKETS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * TICKETS_PAGE_SIZE,
    safePage * TICKETS_PAGE_SIZE
  );

  function toggle(registrationId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(registrationId)) {
        next.delete(registrationId);
      } else {
        next.add(registrationId);
      }
      return next;
    });
  }

  function selectAllEligible() {
    setSelected(new Set(candidates.map((c) => c.registrationId)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const canSubmit =
    selected.size > 0 &&
    confirmation === GENERATE_CONFIRMATION_TEXT &&
    !pending;

  async function submit() {
    if (!canSubmit) {
      return;
    }
    setPending(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/tickets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationIds: [...selected],
          confirmationText: confirmation,
          idempotencyKey,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setErrorMessage(errorMessageFrom(payload));
        setPending(false);
        return;
      }
      const batchId =
        typeof payload === "object" &&
        payload !== null &&
        "batchId" in payload &&
        typeof (payload as { batchId: unknown }).batchId === "string"
          ? (payload as { batchId: string }).batchId
          : null;
      if (batchId === null) {
        setErrorMessage("The generation result could not be read.");
        setPending(false);
        return;
      }
      router.push(`/admin/tickets?batch=${encodeURIComponent(batchId)}`);
    } catch {
      setErrorMessage("The ticket generation failed.");
      setPending(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={selectAllEligible}
            disabled={pending || candidates.length === 0}
            className="rounded-md border border-navy px-3 py-1.5 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            Select all eligible
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={pending || selected.size === 0}
            className="rounded-md border border-navy px-3 py-1.5 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear selection
          </button>
          <span className="text-sm font-semibold text-navy">
            {selected.size} selected
          </span>
        </div>
        <div className="max-w-xs">
          <label htmlFor="candidate-search" className="sr-only">
            Search by graduate name or registration ID
          </label>
          <input
            id="candidate-search"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            maxLength={120}
            placeholder="Graduate name or registration ID"
            className="w-full rounded-md border border-navy/20 bg-white px-3 py-2 text-sm text-navy placeholder:text-navy/40"
          />
        </div>
      </div>

      {pageRows.length === 0 ? (
        <p className="mt-4 rounded-lg border border-navy/10 bg-white p-6 text-sm text-navy/70">
          No eligible registrations without an active ticket match this
          search.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-navy/10 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-navy text-gold-light">
              <tr>
                <th className="px-3 py-2 font-semibold">Select</th>
                <th className="px-3 py-2 font-semibold">Graduate</th>
                <th className="px-3 py-2 font-semibold">Registration ID</th>
                <th className="px-3 py-2 font-semibold">Party size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/10 text-navy">
              {pageRows.map((candidate) => (
                <tr key={candidate.registrationId}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${candidate.graduateName}`}
                      checked={selected.has(candidate.registrationId)}
                      onChange={() => toggle(candidate.registrationId)}
                      disabled={pending}
                      className="h-4 w-4 accent-[#10233f]"
                    />
                  </td>
                  <td className="px-3 py-2 font-semibold">
                    {candidate.graduateName}
                    {candidate.isTest && (
                      <span className="ml-2 rounded-full bg-gold-light px-2 py-0.5 text-[10px] font-semibold uppercase text-navy">
                        Test
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {candidate.sourceRegistrationId ?? "None"}
                  </td>
                  <td className="px-3 py-2">{candidate.partySize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Candidate pagination" className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPage(safePage - 1)}
            disabled={safePage <= 1 || pending}
            className="rounded-md border border-navy px-3 py-1.5 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-navy/70">
            Page {safePage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(safePage + 1)}
            disabled={safePage >= totalPages || pending}
            className="rounded-md border border-navy px-3 py-1.5 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </nav>
      )}

      <div className="mt-6 max-w-md rounded-lg border border-gold bg-white p-4 shadow-sm">
        <label
          htmlFor="generation-confirmation"
          className="block text-sm font-semibold text-navy"
        >
          Type {GENERATE_CONFIRMATION_TEXT} to confirm
        </label>
        <input
          id="generation-confirmation"
          type="text"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={pending}
          autoComplete="off"
          className="mt-2 w-full rounded-md border border-navy/20 bg-white px-3 py-2 font-mono text-sm text-navy"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="mt-3 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-gold-light hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Generating..." : "Generate tickets"}
        </button>
        {errorMessage !== null && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
