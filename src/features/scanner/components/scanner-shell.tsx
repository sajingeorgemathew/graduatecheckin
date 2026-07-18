"use client";

/**
 * Client shell of the scanner page. Owns the validation request
 * lifecycle: one UUID request id per validation action, duplicate
 * suppression while a request is active, the current result panel and
 * the in-memory session history.
 *
 * Decoded payloads are held only in local variables and component state
 * for the duration of one request, then cleared. Nothing scanned is ever
 * logged or written to browser storage.
 */

import { useCallback, useRef, useState } from "react";
import type { TicketValidationResult } from "@/types/database";
import {
  RECENT_VALIDATIONS_LIMIT,
  SCANNER_VALIDATE_API_PATH,
} from "../constants";
import type {
  RecentValidationEntry,
  ScanValidationView,
} from "../types";
import { CameraScanner } from "./camera-scanner";
import { ManualCodeForm } from "./manual-code-form";
import { RecentValidations } from "./recent-validations";
import { ScannerResult } from "./scanner-result";

const OK_RESULTS: ReadonlySet<TicketValidationResult> = new Set([
  "valid",
  "partially_checked_in",
  "already_checked_in",
]);

function isValidationView(value: unknown): value is ScanValidationView {
  return (
    typeof value === "object" &&
    value !== null &&
    "result" in value &&
    typeof (value as { result: unknown }).result === "string" &&
    "validatedAt" in value
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
  return "The ticket could not be validated. Try again.";
}

function vibrateFor(result: TicketValidationResult): void {
  // Optional feedback only; status is always communicated visually.
  if (typeof navigator === "undefined" || navigator.vibrate === undefined) {
    return;
  }
  if (OK_RESULTS.has(result)) {
    navigator.vibrate(80);
  } else {
    navigator.vibrate([60, 60, 60]);
  }
}

export function ScannerShell() {
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ScanValidationView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<RecentValidationEntry[]>([]);
  const [resumeToken, setResumeToken] = useState(0);
  const activeRequestRef = useRef(false);

  const submitValidation = useCallback(
    async (method: "qr" | "manual_code", value: string): Promise<void> => {
      // Ignore duplicate scanner callbacks and repeated submissions while
      // a request is active or a result is still on screen.
      if (activeRequestRef.current) {
        return;
      }
      activeRequestRef.current = true;
      setBusy(true);
      setErrorMessage(null);
      try {
        const response = await fetch(SCANNER_VALIDATE_API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method,
            value,
            requestId: crypto.randomUUID(),
          }),
        });
        const payload: unknown = await response.json();
        if (isValidationView(payload)) {
          setView(payload);
          setHistory((previous) =>
            [
              {
                key: `${payload.validatedAt}-${previous.length}`,
                time: new Date(payload.validatedAt).toLocaleTimeString(),
                result: payload.result,
                graduateName: payload.graduateName,
                ticketCode: payload.ticketCode,
              },
              ...previous,
            ].slice(0, RECENT_VALIDATIONS_LIMIT)
          );
          vibrateFor(payload.result);
        } else {
          setErrorMessage(errorMessageFrom(payload));
        }
      } catch {
        setErrorMessage(
          "The scanner could not reach the server. Check the connection " +
            "and try again."
        );
      } finally {
        // The scanned value goes out of scope here and is never stored.
        setBusy(false);
        activeRequestRef.current = false;
      }
    },
    []
  );

  const handlePayload = useCallback(
    (payload: string) => {
      if (view === null) {
        void submitValidation("qr", payload);
      }
    },
    [submitValidation, view]
  );

  const handleManualCode = useCallback(
    (code: string) => {
      if (view === null) {
        void submitValidation("manual_code", code);
      }
    },
    [submitValidation, view]
  );

  const scanAnother = useCallback(() => {
    setView(null);
    setErrorMessage(null);
    setResumeToken((token) => token + 1);
  }, []);

  const locked = busy || view !== null;

  return (
    <div className="space-y-6">
      {busy && (
        <p
          role="status"
          className="rounded-lg border border-navy/15 bg-white px-4 py-3 text-sm font-semibold text-navy"
        >
          Checking ticket with the server...
        </p>
      )}

      {errorMessage !== null && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm"
        >
          <p className="font-semibold text-red-900">{errorMessage}</p>
          <button
            type="button"
            onClick={scanAnother}
            className="mt-2 min-h-10 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-light"
          >
            Try Again
          </button>
        </div>
      )}

      {view !== null ? (
        <section aria-label="Current result">
          <h2 className="mb-3 text-lg font-semibold text-navy">
            Current result
          </h2>
          <ScannerResult view={view} onScanAnother={scanAnother} />
        </section>
      ) : (
        <>
          <CameraScanner
            onPayload={handlePayload}
            locked={locked}
            resumeToken={resumeToken}
          />
          <section
            aria-label="Manual ticket code"
            className="rounded-xl border border-navy/15 bg-white p-5"
          >
            <h2 className="text-lg font-semibold text-navy">
              Manual ticket code
            </h2>
            <div className="mt-3">
              <ManualCodeForm
                onSubmitCode={handleManualCode}
                disabled={locked}
              />
            </div>
          </section>
        </>
      )}

      <RecentValidations entries={history} />
    </div>
  );
}
