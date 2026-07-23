"use client";

/**
 * Upload form for the direct production import. Sends the RSVP workbook to
 * the upload API and navigates to the reconciliation preview. The workbook
 * is parsed in memory on the server and is never stored.
 */

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ImportIssue } from "../types";

interface UploadSuccess {
  importId: string;
  notices: ImportIssue[];
  previouslyApplied: { importId: string; appliedAt: string | null } | null;
}

function isUploadSuccess(value: unknown): value is UploadSuccess {
  return (
    typeof value === "object" &&
    value !== null &&
    "importId" in value &&
    typeof (value as { importId: unknown }).importId === "string"
  );
}

function errorMessageOf(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error: { message?: unknown } }).error?.message ===
      "string"
  ) {
    return (payload as { error: { message: string } }).error.message;
  }
  return "The upload failed.";
}

export function ProductionUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setErrorMessage(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setErrorMessage("Choose the RSVP .xlsx workbook first.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/admin/production-import", {
        method: "POST",
        body: formData,
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        setErrorMessage(errorMessageOf(payload));
        return;
      }
      if (isUploadSuccess(payload)) {
        router.push(`/admin/production-import/${payload.importId}`);
        return;
      }
      setErrorMessage("The upload response could not be read.");
    } catch {
      setErrorMessage("The upload failed. Check the development server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      <div className="rounded-lg border border-navy/10 bg-white p-6 shadow-sm">
        <label
          htmlFor="production-import-file"
          className="block text-sm font-semibold text-navy"
        >
          RSVP workbook (.xlsx)
        </label>
        <input
          id="production-import-file"
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="mt-3 block w-full cursor-pointer rounded-md border border-navy/20 bg-cream p-3 text-sm text-navy file:mr-4 file:rounded-md file:border-0 file:bg-navy file:px-4 file:py-2 file:text-sm file:font-semibold file:text-gold-light"
        />
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-navy/70">
          <li>
            Upload the workbook exactly as exported. Do not edit the columns
            first; they are matched by name.
          </li>
          <li>
            Repeated rows are not assumed to be duplicates. A row carrying a
            guest, a child or a payment is treated as a supplemental guest
            order and merged into the same graduate.
          </li>
          <li>
            The workbook is parsed in memory and is never stored on the
            server, in the database or in version control.
          </li>
          <li>
            Nothing changes until the reconciliation is reviewed and applied.
          </li>
        </ul>
      </div>

      {errorMessage !== null && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-gold-light shadow-sm hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {submitting
          ? "Uploading and reconciling..."
          : "Upload and reconcile"}
      </button>
    </form>
  );
}
