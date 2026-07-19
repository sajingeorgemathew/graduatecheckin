"use client";

/**
 * Manual arrival form for a registration whose QR ticket is unavailable.
 * Offers only the party members not yet arrived, requires a reason and shows
 * a final review of current attendance, arriving now and attendance after
 * confirmation. One request id per action keeps a retry idempotent and the
 * submit button is disabled while processing. The signed registration
 * reference lives only in component memory.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ATTENDANCE_MANUAL_ARRIVAL_API_PATH,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
} from "../constants";
import { postJson } from "../client";
import type { AttendanceWriteView, PartyTotals } from "../types";
import { isAttendanceWriteView } from "./guards";
import { CountStepper } from "./count-stepper";

interface ManualArrivalFormProps {
  registrationReference: string;
  graduateName: string;
  registered: PartyTotals;
  arrived: PartyTotals;
  onDone: (view: AttendanceWriteView) => void;
  onCancel: () => void;
}

export function ManualArrivalForm({
  registrationReference,
  graduateName,
  registered,
  arrived,
  onDone,
  onCancel,
}: ManualArrivalFormProps) {
  const remaining = useMemo(
    () => ({
      graduate: Math.max(registered.graduate - arrived.graduate, 0),
      adultGuests: Math.max(registered.adultGuests - arrived.adultGuests, 0),
      children0To4: Math.max(
        registered.children0To4 - arrived.children0To4,
        0
      ),
      children5To10: Math.max(
        registered.children5To10 - arrived.children5To10,
        0
      ),
    }),
    [registered, arrived]
  );

  const [graduate, setGraduate] = useState(0);
  const [adultGuests, setAdultGuests] = useState(0);
  const [children0To4, setChildren0To4] = useState(0);
  const [children5To10, setChildren5To10] = useState(0);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  const arrivingTotal =
    graduate + adultGuests + children0To4 + children5To10;
  const reasonValid =
    reason.trim().length >= MIN_REASON_LENGTH &&
    reason.trim().length <= MAX_REASON_LENGTH;
  const canSubmit = !submitting && arrivingTotal > 0 && reasonValid;

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
        ATTENDANCE_MANUAL_ARRIVAL_API_PATH,
        {
          registrationReference,
          requestId: requestIdRef.current,
          graduateArriving: graduate,
          adultGuestsArriving: adultGuests,
          children0To4Arriving: children0To4,
          children5To10Arriving: children5To10,
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
  }, [
    canSubmit,
    registrationReference,
    graduate,
    adultGuests,
    children0To4,
    children5To10,
    reason,
    onDone,
  ]);

  return (
    <section
      aria-label="Record manual arrival"
      className="rounded-xl border-2 border-navy/20 bg-cream p-4"
    >
      <h4 className="text-lg font-bold text-navy">Manual arrival</h4>
      <p className="mt-1 text-sm font-semibold text-navy">{graduateName}</p>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-navy">
            Graduate arriving now
          </span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-6 w-6 rounded border-2 border-navy"
              checked={graduate > 0}
              disabled={remaining.graduate < 1}
              onChange={(event) => setGraduate(event.target.checked ? 1 : 0)}
              aria-label="Graduate arriving now"
            />
            <span className="text-sm text-navy">
              {remaining.graduate >= 1 ? "Yes" : "Already arrived"}
            </span>
          </label>
        </div>
        <CountStepper
          label="Adult guests arriving now"
          value={adultGuests}
          max={remaining.adultGuests}
          onChange={setAdultGuests}
        />
        <CountStepper
          label="Children 0 to 4 arriving now"
          value={children0To4}
          max={remaining.children0To4}
          onChange={setChildren0To4}
        />
        <CountStepper
          label="Children 5 to 10 arriving now"
          value={children5To10}
          max={remaining.children5To10}
          onChange={setChildren5To10}
        />
      </div>

      <label className="mt-4 block text-sm font-semibold text-navy">
        Reason
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={MAX_REASON_LENGTH}
          className="mt-1 w-full rounded-lg border-2 border-navy/30 p-2 text-sm text-navy"
          placeholder="Ticket unavailable, device unavailable, manually verified"
        />
      </label>

      <div className="mt-4 rounded-lg border border-navy/10 bg-white p-3 text-sm text-navy">
        <p className="font-semibold">Review</p>
        <p className="mt-1">
          Current arrived: {arrived.graduate + arrived.adultGuests +
            arrived.children0To4 + arrived.children5To10}
        </p>
        <p>Arriving now: {arrivingTotal}</p>
        <p>
          After confirmation:{" "}
          {arrived.graduate + arrived.adultGuests + arrived.children0To4 +
            arrived.children5To10 + arrivingTotal}
        </p>
      </div>

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
          className="min-h-11 flex-1 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-navy disabled:opacity-50"
        >
          {submitting ? "Recording..." : "Record Manual Arrival"}
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
