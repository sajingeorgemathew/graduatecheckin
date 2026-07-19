"use client";

/**
 * Live attendance dashboard orchestrator. Polls the safe summary endpoint
 * every fifteen seconds while the tab is visible, pauses polling when the tab
 * is hidden, prevents overlapping requests, offers a manual refresh and warns
 * when data becomes stale. It also hosts the registration search and the
 * detail, manual-arrival and correction workspaces.
 *
 * No summary polling uses a Supabase subscription; every refresh is a plain
 * fetch of the private, no-store summary endpoint. Signed references from
 * search results live only in component state and are never written to a URL
 * or browser storage.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ATTENDANCE_SUMMARY_API_PATH,
  DASHBOARD_POLL_INTERVAL_MS,
  DASHBOARD_STALE_AFTER_MS,
} from "../constants";
import { getJson } from "../client";
import type { AttendanceSearchResult, AttendanceSummaryView } from "../types";
import { isAttendanceSummaryView } from "./guards";
import { AttendanceSummaryCards } from "./attendance-summary-cards";
import { AttendanceCategoryProgress } from "./attendance-category-progress";
import { AttendanceRefreshControl } from "./attendance-refresh-control";
import { AttendanceActivity } from "./attendance-activity";
import { AttendanceSearch } from "./attendance-search";
import { AttendanceDetail } from "./attendance-detail";
import { ManualArrivalForm } from "./manual-arrival-form";
import { CorrectionForm } from "./correction-form";
import { WorkspaceOverlay } from "./attendance-workspace-overlay";

type Workspace =
  | { mode: "detail"; result: AttendanceSearchResult }
  | { mode: "manual"; result: AttendanceSearchResult }
  | { mode: "correct"; result: AttendanceSearchResult }
  | null;

export function AttendanceDashboard() {
  const [summary, setSummary] = useState<AttendanceSummaryView | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSuccessMs, setLastSuccessMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [workspace, setWorkspace] = useState<Workspace>(null);

  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setRefreshing(true);
    try {
      const result = await getJson(
        ATTENDANCE_SUMMARY_API_PATH,
        isAttendanceSummaryView
      );
      if (result.ok) {
        setSummary(result.view);
        setLastSuccessMs(Date.now());
        setErrorMessage(null);
      } else {
        setErrorMessage(result.message);
      }
    } catch {
      setErrorMessage("The dashboard could not be refreshed.");
    } finally {
      inFlightRef.current = false;
      setRefreshing(false);
    }
  }, []);

  // Poll every fifteen seconds while the tab is visible; refresh immediately
  // when the tab becomes visible again; stop on unmount.
  useEffect(() => {
    // The initial load is deferred a tick so the effect body itself never
    // updates state synchronously; polling then continues on the interval.
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, DASHBOARD_POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  // A one-second clock so the stale warning appears without a new request.
  useEffect(() => {
    const clock = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  const stale =
    lastSuccessMs !== null && nowMs - lastSuccessMs > DASHBOARD_STALE_AFTER_MS;
  const lastUpdated =
    summary !== null ? summary.generatedAt : null;

  const closeWorkspace = useCallback(() => setWorkspace(null), []);

  return (
    <div className="space-y-6">
      <AttendanceRefreshControl
        lastUpdated={lastUpdated}
        refreshing={refreshing}
        stale={stale}
        onRefresh={() => void refresh()}
      />

      {errorMessage !== null && (
        <p role="alert" className="text-sm font-semibold text-red-900">
          {errorMessage}
        </p>
      )}

      {summary !== null ? (
        <>
          <AttendanceSummaryCards summary={summary} />
          <AttendanceCategoryProgress summary={summary} />
        </>
      ) : (
        <p className="text-sm text-navy/70">Loading attendance summary...</p>
      )}

      <AttendanceSearch
        onView={(result) => setWorkspace({ mode: "detail", result })}
        onManual={(result) => setWorkspace({ mode: "manual", result })}
        onCorrect={(result) => setWorkspace({ mode: "correct", result })}
      />

      {workspace !== null && workspace.mode === "detail" && (
        <WorkspaceOverlay title="Registration attendance" onClose={closeWorkspace}>
          <AttendanceDetail
            registrationReference={workspace.result.registrationReference}
            onClose={closeWorkspace}
            onChanged={() => void refresh()}
          />
        </WorkspaceOverlay>
      )}
      {workspace !== null && workspace.mode === "manual" && (
        <WorkspaceOverlay title="Record manual arrival" onClose={closeWorkspace}>
          <ManualArrivalForm
            registrationReference={workspace.result.registrationReference}
            graduateName={workspace.result.graduateName}
            registered={workspace.result.registered}
            arrived={workspace.result.arrived}
            onCancel={closeWorkspace}
            onDone={() => {
              closeWorkspace();
              void refresh();
            }}
          />
        </WorkspaceOverlay>
      )}
      {workspace !== null && workspace.mode === "correct" && (
        <WorkspaceOverlay title="Correct attendance" onClose={closeWorkspace}>
          <CorrectionForm
            registrationReference={workspace.result.registrationReference}
            graduateName={workspace.result.graduateName}
            registered={workspace.result.registered}
            arrived={workspace.result.arrived}
            onCancel={closeWorkspace}
            onDone={() => {
              closeWorkspace();
              void refresh();
            }}
          />
        </WorkspaceOverlay>
      )}

      <section aria-label="Recent attendance activity">
        <h2 className="text-base font-semibold text-navy">Recent activity</h2>
        <div className="mt-3">
          {summary !== null ? (
            <AttendanceActivity entries={summary.recentActivity} />
          ) : (
            <p className="text-sm text-navy/70">Loading...</p>
          )}
        </div>
      </section>
    </div>
  );
}
