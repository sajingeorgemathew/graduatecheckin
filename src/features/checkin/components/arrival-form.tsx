"use client";

/**
 * Arrival-confirmation form shown below a valid or partial validation
 * result. Owns the count selection, one request id per confirmation action
 * (reused across a network retry) and the submission lifecycle.
 *
 * The validation-attempt id is received in props and kept only in current
 * component memory. It is never written to a URL, query string, cookie,
 * localStorage, sessionStorage, console or analytics. All workflow state
 * lives in React only and is discarded when the component unmounts or the
 * staff member scans the next ticket.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { CHECKIN_CONFIRM_API_PATH } from "../constants";
import {
  clampSelection,
  deriveRemaining,
  emptySelection,
  fullRemainingSelection,
  graduateOnlySelection,
  totalArriving,
  type PartyAllowance,
} from "../attendance";
import type {
  ArrivalSelection,
  CheckinConfirmationView,
} from "../types";
import { ArrivalConfirmation } from "./arrival-confirmation";
import { ArrivalCountControl } from "./arrival-count-control";
import { ArrivalReview } from "./arrival-review";
import { AttendanceProgress } from "./attendance-progress";

/** The subset of the validation result the form needs to render. */
export interface ArrivalFormInput {
  validationAttemptId: string;
  graduateName: string | null;
  ticketCode: string | null;
  registeredAdultGuests: number;
  registeredChildren0To4: number;
  registeredChildren5To10: number;
  graduateArrived: number;
  adultGuestsArrived: number;
  children0To4Arrived: number;
  children5To10Arrived: number;
}

interface ArrivalFormProps {
  input: ArrivalFormInput;
  onScanNext: () => void;
}

function isConfirmationView(value: unknown): value is CheckinConfirmationView {
  return (
    typeof value === "object" &&
    value !== null &&
    "result" in value &&
    typeof (value as { result: unknown }).result === "string" &&
    "message" in value
  );
}

function errorMessageFrom(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "object"
  ) {
    const inner = (value as { error: { message?: unknown } }).error;
    if (typeof inner.message === "string" && inner.message.length > 0) {
      return inner.message;
    }
  }
  return "The arrival could not be recorded. Scan the ticket again.";
}

const SUCCESS_RESULTS = new Set(["partial", "complete"]);

export function ArrivalForm({ input, onScanNext }: ArrivalFormProps) {
  const allowance: PartyAllowance = useMemo(
    () => ({
      graduateArrived: input.graduateArrived,
      adultGuestsRegistered: input.registeredAdultGuests,
      adultGuestsArrived: input.adultGuestsArrived,
      children0To4Registered: input.registeredChildren0To4,
      children0To4Arrived: input.children0To4Arrived,
      children5To10Registered: input.registeredChildren5To10,
      children5To10Arrived: input.children5To10Arrived,
    }),
    [input]
  );
  const remaining = useMemo(() => deriveRemaining(allowance), [allowance]);

  const [selection, setSelection] = useState<ArrivalSelection>(emptySelection);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] =
    useState<CheckinConfirmationView | null>(null);

  // One request id per confirmation action. It is kept in a ref so a
  // network retry of the same click reuses it and never creates a second
  // attendance row. A new confirmation action generates a fresh id.
  const requestIdRef = useRef<string | null>(null);

  const update = useCallback(
    (next: ArrivalSelection) => {
      setSelection(clampSelection(next, remaining));
    },
    [remaining]
  );

  const submit = useCallback(async () => {
    if (submitting || totalArriving(selection) === 0) {
      return;
    }
    if (requestIdRef.current === null) {
      requestIdRef.current = crypto.randomUUID();
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await fetch(CHECKIN_CONFIRM_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          validationAttemptId: input.validationAttemptId,
          requestId: requestIdRef.current,
          graduateArriving: selection.graduate,
          adultGuestsArriving: selection.adultGuests,
          children0To4Arriving: selection.children0To4,
          children5To10Arriving: selection.children5To10,
        }),
      });
      const payload: unknown = await response.json();
      if (isConfirmationView(payload) && SUCCESS_RESULTS.has(payload.result)) {
        setConfirmation(payload);
      } else if (isConfirmationView(payload)) {
        // A safe non-success result: show its staff-readable message and
        // require a new scan. The request id is not reused for a new action.
        setErrorMessage(payload.message);
        requestIdRef.current = null;
      } else {
        setErrorMessage(errorMessageFrom(payload));
        requestIdRef.current = null;
      }
    } catch {
      // The network failed. Keep the same request id so a retry stays
      // idempotent and cannot create a second attendance row.
      setErrorMessage(
        "The network request failed. Check the connection and confirm again."
      );
    } finally {
      setSubmitting(false);
    }
  }, [input.validationAttemptId, selection, submitting]);

  if (confirmation !== null) {
    return <ArrivalConfirmation view={confirmation} onScanNext={onScanNext} />;
  }

  const registered = {
    graduate: 1,
    adultGuests: input.registeredAdultGuests,
    children0To4: input.registeredChildren0To4,
    children5To10: input.registeredChildren5To10,
  };
  const arrivedBefore = {
    graduate: input.graduateArrived,
    adultGuests: input.adultGuestsArrived,
    children0To4: input.children0To4Arrived,
    children5To10: input.children5To10Arrived,
  };
  const arrivingNow = {
    graduate: selection.graduate,
    adultGuests: selection.adultGuests,
    children0To4: selection.children0To4,
    children5To10: selection.children5To10,
  };

  const noneSelected = totalArriving(selection) === 0;
  const canConfirm = !submitting && !noneSelected;

  return (
    <section
      aria-label="Record arrival"
      className="rounded-xl border-2 border-navy/20 bg-white p-5 shadow-sm"
    >
      <h3 className="text-xl font-bold text-navy">Record arrival</h3>
      {input.graduateName !== null && (
        <p className="mt-1 text-base font-semibold text-navy">
          {input.graduateName}
        </p>
      )}

      <div className="mt-4">
        <AttendanceProgress
          registered={registered}
          arrivedBefore={arrivedBefore}
          arrivingNow={arrivingNow}
        />
      </div>

      <div className="mt-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-base font-semibold text-navy">
            Graduate arriving now
          </span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-6 w-6 rounded border-2 border-navy text-navy"
              checked={selection.graduate > 0}
              disabled={!remaining.graduateAvailable}
              aria-label="Graduate arriving now"
              onChange={(event) =>
                update({
                  ...selection,
                  graduate: event.target.checked ? 1 : 0,
                })
              }
            />
            <span className="text-base text-navy">
              {remaining.graduateAvailable ? "Yes" : "Already arrived"}
            </span>
          </label>
        </div>

        <ArrivalCountControl
          label="Adult guests"
          value={selection.adultGuests}
          max={remaining.adultGuests}
          onChange={(next) => update({ ...selection, adultGuests: next })}
        />
        <ArrivalCountControl
          label="Children 0 to 4"
          value={selection.children0To4}
          max={remaining.children0To4}
          onChange={(next) => update({ ...selection, children0To4: next })}
        />
        <ArrivalCountControl
          label="Children 5 to 10"
          value={selection.children5To10}
          max={remaining.children5To10}
          onChange={(next) => update({ ...selection, children5To10: next })}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => update(fullRemainingSelection(remaining))}
          className="min-h-11 flex-1 rounded-lg border-2 border-navy bg-navy px-3 py-2 text-sm font-semibold text-white"
        >
          Full Remaining Party
        </button>
        <button
          type="button"
          onClick={() => update(graduateOnlySelection(remaining))}
          disabled={!remaining.graduateAvailable}
          className="min-h-11 flex-1 rounded-lg border-2 border-navy bg-white px-3 py-2 text-sm font-semibold text-navy disabled:border-navy/20 disabled:text-navy/30"
        >
          Graduate Only
        </button>
        <button
          type="button"
          onClick={() => update(emptySelection())}
          className="min-h-11 flex-1 rounded-lg border-2 border-navy bg-white px-3 py-2 text-sm font-semibold text-navy"
        >
          Clear
        </button>
      </div>

      {noneSelected && (
        <p role="note" className="mt-4 text-sm font-semibold text-navy">
          Select at least one arriving person.
        </p>
      )}

      <div className="mt-5">
        <ArrivalReview selection={selection} />
      </div>

      {errorMessage !== null && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-red-900">{errorMessage}</p>
          <button
            type="button"
            onClick={onScanNext}
            className="mt-2 min-h-10 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-light"
          >
            Scan Next Ticket
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!canConfirm}
        className="mt-5 min-h-12 w-full rounded-lg bg-gold px-5 py-3 text-base font-bold text-navy hover:bg-gold-light disabled:bg-navy/15 disabled:text-navy/40"
      >
        {submitting ? "Recording arrival..." : "Confirm Arrival"}
      </button>
    </section>
  );
}
