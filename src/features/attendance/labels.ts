/**
 * Client-safe display labels and formatting for attendance views. No secret,
 * identifier or personal value is derived here.
 */

import type { AttendanceEntryKind } from "@/types/database";
import type { AttendanceClassification } from "./calculations";

export const ENTRY_KIND_LABELS: Record<AttendanceEntryKind, string> = {
  scan_arrival: "Scan arrival",
  manual_arrival: "Manual arrival",
  correction: "Correction",
  reversal: "Reversal",
};

export const CLASSIFICATION_LABELS: Record<AttendanceClassification, string> = {
  not_arrived: "Not arrived",
  partial: "Partial",
  complete: "Complete",
};

/** Formats a delta with an explicit sign so negatives always show a minus. */
export function formatDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

/** A short local time for an ISO timestamp. Falls back to the raw value. */
export function formatTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
