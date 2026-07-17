"use client";

/**
 * Administrator upload form. Sends the workbook to the upload API and
 * navigates to the created preview. The original file is parsed in memory
 * on the server and never retained.
 */

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ImportIssue } from "../types";

interface UploadSuccess {
  duplicate: boolean;
  importId: string;
  notices: ImportIssue[];
  previousApplied: {
    importId: string;
    appliedAt: string | null;
    totalRows: number;
  } | null;
}

function isUploadSuccess(value: unknown): value is UploadSuccess {
  return (
    typeof value === "object" &&
    value !== null &&
    "importId" in value &&
    typeof (value as { importId: unknown }).importId === "string"
  );
}

export function UploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<UploadSuccess | null>(
    null
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setErrorMessage(null);
    setDuplicateInfo(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setErrorMessage("Choose an .xlsx workbook first.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/admin/imports", {
        method: "POST",
        body: formData,
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof (payload as { error: { message?: unknown } }).error
            ?.message === "string"
            ? (payload as { error: { message: string } }).error.message
            : "The upload failed.";
        setErrorMessage(message);
        return;
      }

      if (isUploadSuccess(payload)) {
        if (payload.duplicate) {
          setDuplicateInfo(payload);
          return;
        }
        router.push(`/admin/imports/${payload.importId}`);
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
          htmlFor="import-file"
          className="block text-sm font-semibold text-navy"
        >
          Registration workbook (.xlsx)
        </label>
        <input
          id="import-file"
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="mt-3 block w-full cursor-pointer rounded-md border border-navy/20 bg-cream p-3 text-sm text-navy file:mr-4 file:rounded-md file:border-0 file:bg-navy file:px-4 file:py-2 file:text-sm file:font-semibold file:text-gold-light"
        />
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-navy/70">
          <li>Only .xlsx workbooks are accepted, up to 10 MB.</li>
          <li>
            The workbook must contain the expected registration export
            columns. Columns are matched by header name.
          </li>
          <li>
            The original file is parsed in memory and is never stored on the
            server, in the database or in version control.
          </li>
          <li>
            Nothing changes until the preview is reviewed and applied.
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

      {duplicateInfo !== null && (
        <div className="mt-4 rounded-md border border-gold bg-white p-4 text-sm text-navy">
          <p className="font-semibold">
            This exact file was already applied.
          </p>
          <p className="mt-1 text-navy/75">
            {duplicateInfo.previousApplied?.appliedAt
              ? `It was applied on ${new Date(
                  duplicateInfo.previousApplied.appliedAt
                ).toLocaleString("en-CA", { timeZone: "America/Toronto" })} ` +
                `covering ${duplicateInfo.previousApplied.totalRows} rows. `
              : ""}
            No new registration changes were created. Upload a changed
            workbook to import updates.
          </p>
          {duplicateInfo.previousApplied !== null && (
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/admin/imports/${duplicateInfo.previousApplied?.importId}`
                )
              }
              className="mt-3 rounded-md border border-navy px-3 py-1.5 text-xs font-semibold text-navy hover:bg-navy hover:text-gold-light"
            >
              View the previous import
            </button>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-gold-light shadow-sm hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {submitting ? "Uploading and building preview..." : "Upload and Preview"}
      </button>
    </form>
  );
}
