/**
 * Pure evaluation of the configured active graduation event. The event
 * code is read from the server-only ACTIVE_GRADUATION_EVENT_CODE variable
 * and is never accepted from browser input. Closed and archived events are
 * rejected so imports and ticket operations can never target a finished
 * ceremony. This module stays free of database access so it is unit
 * testable; the server-side resolver lives in resolve-active-event.ts.
 */

import type { GraduationEventRow } from "@/types/database";

export type ActiveEventFailureCode =
  | "event_code_not_configured"
  | "event_not_found"
  | "event_not_open";

export type ActiveEventResolution =
  | { ok: true; event: GraduationEventRow }
  | { ok: false; code: ActiveEventFailureCode };

export const ACTIVE_EVENT_FAILURE_MESSAGES: Record<
  ActiveEventFailureCode,
  string
> = {
  event_code_not_configured:
    "ACTIVE_GRADUATION_EVENT_CODE is not configured on the server.",
  event_not_found:
    "The configured graduation event was not found. Create or seed it first.",
  event_not_open:
    "The configured graduation event is closed or archived.",
};

export function evaluateActiveEvent(
  eventCode: string,
  event: GraduationEventRow | null
): ActiveEventResolution {
  if (eventCode.trim().length === 0) {
    return { ok: false, code: "event_code_not_configured" };
  }
  if (event === null) {
    return { ok: false, code: "event_not_found" };
  }
  if (event.status === "closed" || event.status === "archived") {
    return { ok: false, code: "event_not_open" };
  }
  return { ok: true, event };
}
