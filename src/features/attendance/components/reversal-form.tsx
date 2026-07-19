"use client";

/**
 * Reversal form. Reverses one eligible attendance entry by inserting its
 * exact negative. Requires a reason, a summary of the original entry, a
 * summary of the exact negative reversal and the exact confirmation text
 * REVERSE ENTRY. The signed entry reference and one request id per action
 * live only in component memory and are never written to a URL or storage.
 */

import { useCallback, useRef, useState } from "react";
import {
  ATTENDANCE_REVERSE_API_PATH,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  REVERSAL_CONFIRMATION_TEXT,
} from "../constants";
import { postJson } from "../client";
import { formatDelta } from "../labels";
import type { AttendanceHistoryEntry, AttendanceWriteView } from "../types";
import { isAttendanceWriteView } from "./guards";

interface ReversalFormProps {
  entry: AttendanceHistoryEntry;
  onDone: (view: AttendanceWriteView) => void;
  onCancel: () => void;
}

export function ReversalForm({ entry, onDone, onCancel }: ReversalFormProps) {
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  const reasonValid =
    reason.trim().length >= MIN_REASON_LENGTH &&
    reason.trim().length <= MAX_REASON_LENGTH;
  const confirmValid = confirmation.trim() === REVERSAL_CONFIRMATION_TEXT;
  const canSubmit =
    !submitting && reasonValid && confirmValid && entry.entryReference !== null;

  const submit = useCallback(async () => {
    if (!canSubmit || entry.entryReference === null) {
      return;
    }
    if (requestIdRef.current === null) {
      requestIdRef.current = crypto.randomUUID();
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await postJson(
        ATTENDANCE_REVERSE_API_PATH,
        {
          entryReference: entry.entryReference,
          requestId: requestIdRef.current,
          reason: reason.trim(),
        },
        isAttendanceWriteView
      );
      if (result.ok) {
        onDone(result.view);
      } else {
        setErrorMessage(result.message);
        requestIdRef.current = null;
      }
    } catch {
      setErrorMessage(
        "The network request failed. Check the connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, entry.entryReference, onDone, reason]);

  return (
    <section
      aria-label="Reverse entry"
      className="rounded-xl border-2 border-navy/20 bg-cream p-4"
    >
      <h4 className="text-lg font-bold text-navy">Reverse entry</h4>

      <div className="mt-3 rounded-lg border border-navy/10 bg-white p-3 text-sm text-navy">
        <p className="font-semibold">Original entry</p>
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <span>Graduate {formatDelta(entry.graduateDelta)}</span>
          <span>Adults {formatDelta(entry.adultGuestDelta)}</span>
          <span>Children 0 to 4 {formatDelta(entry.child0To4Delta)}</span>
          <span>Children 5 to 10 {formatDelta(entry.child5To10Delta)}</span>
        </div>
        <p className="mt-3 font-semibold">Exact reversal</p>
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <span>Graduate {formatDelta(-entry.graduateDelta)}</span>
          <span>Adults {formatDelta(-entry.adultGuestDelta)}</span>
          <span>Children 0 to 4 {formatDelta(-entry.child0To4Delta)}</span>
          <span>Children 5 to 10 {formatDelta(-entry.child5To10Delta)}</span>
        </div>
      </div>

      <label className="mt-3 block text-sm font-semibold text-navy">
        Reason
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={MAX_REASON_LENGTH}
          className="mt-1 w-full rounded-lg border-2 border-navy/30 p-2 text-sm text-navy"
          placeholder="Explain why this entry is being reversed"
        />
      </label>

      <label className="mt-3 block text-sm font-semibold text-navy">
        Type {REVERSAL_CONFIRMATION_TEXT} to confirm
        <input
          type="text"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="mt-1 w-full rounded-lg border-2 border-navy/30 p-2 text-sm text-navy"
          autoComplete="off"
        />
      </label>

      {errorMessage !== null && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-900">
          {errorMessage}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="min-h-11 flex-1 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {submitting ? "Reversing..." : "Reverse Entry"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg border-2 border-navy bg-white px-4 py-2 text-sm font-semibold text-navy"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
