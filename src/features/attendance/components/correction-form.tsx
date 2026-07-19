"use client";

/**
 * Correction form. Adjusts registration-level attendance with positive or
 * negative deltas per category, bounded so a resulting total never leaves
 * zero and the registered allowance. Requires a reason and the exact
 * confirmation text APPLY CORRECTION because corrections are higher risk than
 * normal arrivals. One request id per action keeps a retry idempotent. The
 * signed registration reference lives only in component memory.
 */

import { useCallback, useRef, useState } from "react";
import {
  ATTENDANCE_CORRECTION_API_PATH,
  CORRECTION_CONFIRMATION_TEXT,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
} from "../constants";
import { postJson } from "../client";
import { formatDelta } from "../labels";
import type { AttendanceWriteView, PartyTotals } from "../types";
import { isAttendanceWriteView } from "./guards";

interface CorrectionFormProps {
  registrationReference: string;
  graduateName: string;
  registered: PartyTotals;
  arrived: PartyTotals;
  onDone: (view: AttendanceWriteView) => void;
  onCancel: () => void;
}

type CategoryKey =
  | "graduate"
  | "adultGuests"
  | "children0To4"
  | "children5To10";

interface DeltaState {
  graduate: number;
  adultGuests: number;
  children0To4: number;
  children5To10: number;
}

const ZERO_DELTAS: DeltaState = {
  graduate: 0,
  adultGuests: 0,
  children0To4: 0,
  children5To10: 0,
};

interface CategoryConfig {
  key: CategoryKey;
  label: string;
  deltaMin: number;
  deltaMax: number;
}

const CATEGORIES: CategoryConfig[] = [
  { key: "graduate", label: "Graduate", deltaMin: -1, deltaMax: 1 },
  { key: "adultGuests", label: "Adult guests", deltaMin: -2, deltaMax: 2 },
  { key: "children0To4", label: "Children 0 to 4", deltaMin: -2, deltaMax: 2 },
  { key: "children5To10", label: "Children 5 to 10", deltaMin: -2, deltaMax: 2 },
];

export function CorrectionForm({
  registrationReference,
  graduateName,
  registered,
  arrived,
  onDone,
  onCancel,
}: CorrectionFormProps) {
  const [deltas, setDeltas] = useState<DeltaState>(ZERO_DELTAS);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  const resultingOf = (key: CategoryKey): number =>
    arrived[key] + deltas[key];

  const setDelta = (key: CategoryKey, next: number, config: CategoryConfig) => {
    const bounded = Math.min(Math.max(next, config.deltaMin), config.deltaMax);
    const resulting = arrived[key] + bounded;
    if (resulting < 0 || resulting > registered[key]) {
      return;
    }
    setDeltas((current) => ({ ...current, [key]: bounded }));
  };

  const nonZero =
    deltas.graduate !== 0 ||
    deltas.adultGuests !== 0 ||
    deltas.children0To4 !== 0 ||
    deltas.children5To10 !== 0;
  const reasonValid =
    reason.trim().length >= MIN_REASON_LENGTH &&
    reason.trim().length <= MAX_REASON_LENGTH;
  const confirmValid = confirmation.trim() === CORRECTION_CONFIRMATION_TEXT;
  const canSubmit = !submitting && nonZero && reasonValid && confirmValid;

  const submit = useCallback(async () => {
    if (!canSubmit) {
      return;
    }
    if (requestIdRef.current === null) {
      requestIdRef.current = crypto.randomUUID();
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await postJson(
        ATTENDANCE_CORRECTION_API_PATH,
        {
          registrationReference,
          requestId: requestIdRef.current,
          graduateDelta: deltas.graduate,
          adultGuestDelta: deltas.adultGuests,
          child0To4Delta: deltas.children0To4,
          child5To10Delta: deltas.children5To10,
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
  }, [canSubmit, registrationReference, deltas, reason, onDone]);

  return (
    <section
      aria-label="Correct attendance"
      className="rounded-xl border-2 border-navy/20 bg-cream p-4"
    >
      <h4 className="text-lg font-bold text-navy">Correct attendance</h4>
      <p className="mt-1 text-sm font-semibold text-navy">{graduateName}</p>

      <div className="mt-4 space-y-3">
        {CATEGORIES.map((config) => (
          <div
            key={config.key}
            className="flex items-center justify-between gap-3"
          >
            <div className="text-sm font-semibold text-navy">
              {config.label}
              <span className="ml-1 text-xs font-normal text-navy/60">
                (current {arrived[config.key]} of {registered[config.key]})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Decrease ${config.label}`}
                onClick={() =>
                  setDelta(config.key, deltas[config.key] - 1, config)
                }
                className="h-11 w-11 rounded-lg border-2 border-navy bg-white text-lg font-bold text-navy"
              >
                -
              </button>
              <span className="w-10 text-center text-sm font-bold text-navy">
                {formatDelta(deltas[config.key])}
              </span>
              <button
                type="button"
                aria-label={`Increase ${config.label}`}
                onClick={() =>
                  setDelta(config.key, deltas[config.key] + 1, config)
                }
                className="h-11 w-11 rounded-lg border-2 border-navy bg-white text-lg font-bold text-navy"
              >
                +
              </button>
              <span className="w-16 text-right text-xs text-navy/70">
                to {resultingOf(config.key)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <label className="mt-4 block text-sm font-semibold text-navy">
        Reason
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={MAX_REASON_LENGTH}
          className="mt-1 w-full rounded-lg border-2 border-navy/30 p-2 text-sm text-navy"
          placeholder="Explain the correction"
        />
      </label>

      <div className="mt-4 rounded-lg border border-navy/10 bg-white p-3 text-sm text-navy">
        <p className="font-semibold">Current attendance</p>
        <p className="mt-1">
          Graduate {arrived.graduate}, Adults {arrived.adultGuests}, Children 0
          to 4 {arrived.children0To4}, Children 5 to 10 {arrived.children5To10}
        </p>
        <p className="mt-2 font-semibold">Correction</p>
        <p className="mt-1">
          Graduate {formatDelta(deltas.graduate)}, Adults{" "}
          {formatDelta(deltas.adultGuests)}, Children 0 to 4{" "}
          {formatDelta(deltas.children0To4)}, Children 5 to 10{" "}
          {formatDelta(deltas.children5To10)}
        </p>
        <p className="mt-2 font-semibold">Attendance after correction</p>
        <p className="mt-1">
          Graduate {resultingOf("graduate")}, Adults{" "}
          {resultingOf("adultGuests")}, Children 0 to 4{" "}
          {resultingOf("children0To4")}, Children 5 to 10{" "}
          {resultingOf("children5To10")}
        </p>
      </div>

      <label className="mt-3 block text-sm font-semibold text-navy">
        Type {CORRECTION_CONFIRMATION_TEXT} to confirm
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
          {submitting ? "Applying..." : "Apply Correction"}
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
