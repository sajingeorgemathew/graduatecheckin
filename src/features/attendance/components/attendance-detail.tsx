"use client";

/**
 * Registration attendance detail. Loads the safe detail view for a signed
 * registration reference, shows current attendance and the append-only
 * history, and hosts the reversal form for an eligible entry. The reference
 * is passed in props and kept only in component memory.
 */

import { useCallback, useEffect, useState } from "react";
import { ATTENDANCE_DETAIL_API_PATH } from "../constants";
import { postJson } from "../client";
import { CLASSIFICATION_LABELS } from "../labels";
import type { AttendanceDetailView, AttendanceHistoryEntry } from "../types";
import { isAttendanceDetailView } from "./guards";
import { AttendanceHistory } from "./attendance-history";
import { ReversalForm } from "./reversal-form";

interface AttendanceDetailProps {
  registrationReference: string;
  onClose: () => void;
  onChanged: () => void;
}

function partyLine(party: AttendanceDetailView["registered"]): string {
  return `G ${party.graduate}, A ${party.adultGuests}, C0-4 ${party.children0To4}, C5-10 ${party.children5To10}`;
}

export function AttendanceDetail({
  registrationReference,
  onClose,
  onChanged,
}: AttendanceDetailProps) {
  const [detail, setDetail] = useState<AttendanceDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reversing, setReversing] = useState<AttendanceHistoryEntry | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await postJson(
        ATTENDANCE_DETAIL_API_PATH,
        { registrationReference },
        isAttendanceDetailView
      );
      if (result.ok) {
        setDetail(result.view);
      } else {
        setErrorMessage(result.message);
      }
    } catch {
      setErrorMessage("The attendance detail could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [registrationReference]);

  useEffect(() => {
    // Deferred a tick so the effect body never updates state synchronously.
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  return (
    <section
      aria-label="Registration attendance"
      className="rounded-xl border-2 border-navy/20 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-navy">Registration attendance</h3>
        <button
          type="button"
          onClick={onClose}
          className="min-h-9 rounded-lg border-2 border-navy bg-white px-3 py-1.5 text-xs font-semibold text-navy"
        >
          Close
        </button>
      </div>

      {loading && <p className="mt-3 text-sm text-navy/70">Loading...</p>}
      {errorMessage !== null && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-900">
          {errorMessage}
        </p>
      )}

      {detail !== null && (
        <div className="mt-3 space-y-4">
          <div>
            <p className="font-semibold text-navy">{detail.graduateName}</p>
            <p className="text-xs text-navy/70">
              Registration: {detail.registrationStatus}
              {detail.ticketStatus !== null &&
                ` | Ticket: ${detail.ticketStatus}`}{" "}
              | {CLASSIFICATION_LABELS[detail.classification]}
            </p>
            <div className="mt-2 space-y-0.5 text-xs text-navy/80">
              <p>Registered: {partyLine(detail.registered)}</p>
              <p>Arrived: {partyLine(detail.arrived)}</p>
              <p>Remaining: {partyLine(detail.remaining)}</p>
            </div>
          </div>

          {reversing !== null ? (
            <ReversalForm
              entry={reversing}
              onCancel={() => setReversing(null)}
              onDone={() => {
                setReversing(null);
                onChanged();
                void load();
              }}
            />
          ) : (
            <div>
              <h4 className="text-sm font-semibold text-navy">
                Attendance history
              </h4>
              <div className="mt-2">
                <AttendanceHistory
                  entries={detail.history}
                  onReverse={(entry) => setReversing(entry)}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
