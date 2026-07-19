"use client";

/**
 * Manual registration search with live results and server-enforced filters.
 * Typing searches automatically: name and source-registration-id searches run
 * after a short debounce once they reach the minimum length, and a complete
 * ticket code searches immediately. Pressing Enter or the optional Search
 * button searches at once. Filters combine with the term and, when no term is
 * present, browse the active event on their own, for example every signed-up
 * registration.
 *
 * Only the newest request is honored: each request carries a sequence number
 * and a stale response is ignored. Clearing the field clears the results.
 * Nothing is searched by email or phone, the term is never logged, and results
 * and their signed registration references live only in component memory and
 * are never written to a URL or browser storage.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ATTENDANCE_SEARCH_API_PATH,
  SEARCH_DEBOUNCE_MS,
} from "../constants";
import { postJson } from "../client";
import {
  ATTENDANCE_STATUS_OPTIONS,
  DEFAULT_FILTERS,
  ENVIRONMENT_OPTIONS,
  REGISTRATION_STATUS_OPTIONS,
  RSVP_STATUS_OPTIONS,
  TICKET_STATUS_OPTIONS,
  filtersAreDefault,
  type AttendanceFilters,
} from "../filters";
import { planSearch, type SearchField } from "../search-plan";
import type { AttendanceSearchResult, AttendanceSearchView } from "../types";
import { isAttendanceSearchView } from "./guards";
import { AttendanceSearchResults } from "./attendance-search-results";

interface AttendanceSearchProps {
  onView: (result: AttendanceSearchResult) => void;
  onManual: (result: AttendanceSearchResult) => void;
  onCorrect: (result: AttendanceSearchResult) => void;
}

const FIELD_LABELS: Record<SearchField, string> = {
  name: "Graduate name",
  ticket_code: "Ticket code",
  source_id: "Source registration ID",
};

const SELECT_CLASS =
  "min-h-11 w-full rounded-lg border-2 border-navy/30 px-2 text-sm text-navy";

export function AttendanceSearch({
  onView,
  onManual,
  onCorrect,
}: AttendanceSearchProps) {
  const [field, setField] = useState<SearchField>("name");
  const [term, setTerm] = useState("");
  const [filters, setFilters] = useState<AttendanceFilters>(DEFAULT_FILTERS);
  const [view, setView] = useState<AttendanceSearchView | null>(null);
  const [searching, setSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // Increments on every request and every clear so a slow, stale response can
  // be discarded: only the response whose sequence still matches is applied.
  const seqRef = useRef(0);

  const runSearch = useCallback(
    async (
      searchField: SearchField,
      searchTerm: string,
      searchFilters: AttendanceFilters
    ) => {
      const mySeq = (seqRef.current += 1);
      setSearching(true);
      setErrorMessage(null);
      try {
        const result = await postJson(
          ATTENDANCE_SEARCH_API_PATH,
          { field: searchField, term: searchTerm, filters: searchFilters },
          isAttendanceSearchView
        );
        if (mySeq !== seqRef.current) {
          return; // A newer request has superseded this one.
        }
        if (result.ok) {
          setView(result.view);
        } else {
          setErrorMessage(result.message);
          setView(null);
        }
      } catch {
        if (mySeq === seqRef.current) {
          setErrorMessage("The search request failed. Try again.");
        }
      } finally {
        if (mySeq === seqRef.current) {
          setSearching(false);
        }
      }
    },
    []
  );

  const clearResults = useCallback(() => {
    seqRef.current += 1; // Invalidate any in-flight response.
    setView(null);
    setErrorMessage(null);
    setSearching(false);
  }, []);

  // Live search: react to the field, term and filters. All state changes run
  // inside a timeout so the effect body never updates state synchronously.
  // Text searches wait for the debounce; a complete ticket code and the clear
  // and hint cases run on the next tick.
  useEffect(() => {
    const plan = planSearch(field, term);
    const browsing = plan.term.length === 0 && !filtersAreDefault(filters);
    const emptyDefault = plan.term.length === 0 && filtersAreDefault(filters);
    const termNotSearchable =
      plan.term.length > 0 && !plan.shouldSearch && !browsing;
    const runNow = plan.term.length > 0 ? plan.shouldSearch : browsing;
    const immediate = emptyDefault || termNotSearchable || plan.immediate;
    const delay = immediate ? 0 : SEARCH_DEBOUNCE_MS;

    const handle = window.setTimeout(() => {
      if (emptyDefault) {
        setHint(null);
        clearResults();
        return;
      }
      if (termNotSearchable) {
        setHint(plan.hint);
        clearResults();
        return;
      }
      setHint(plan.hint);
      if (runNow) {
        void runSearch(field, plan.term, filters);
      }
    }, delay);
    return () => window.clearTimeout(handle);
  }, [field, term, filters, runSearch, clearResults]);

  const submitNow = useCallback(() => {
    const plan = planSearch(field, term);
    const browsing = plan.term.length === 0 && !filtersAreDefault(filters);
    if (plan.term.length === 0 && filtersAreDefault(filters)) {
      clearResults();
      return;
    }
    if (plan.term.length > 0 && !plan.shouldSearch && !browsing) {
      setHint(plan.hint);
      return;
    }
    void runSearch(field, plan.term, filters);
  }, [field, term, filters, runSearch, clearResults]);

  const setFilter = <K extends keyof AttendanceFilters>(
    key: K,
    value: AttendanceFilters[K]
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <section
      aria-label="Search registrations"
      className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm"
    >
      <h2 className="text-base font-semibold text-navy">Find a registration</h2>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          submitNow();
        }}
      >
        <label className="sr-only" htmlFor="attendance-search-field">
          Search field
        </label>
        <select
          id="attendance-search-field"
          value={field}
          onChange={(event) => setField(event.target.value as SearchField)}
          className="min-h-11 rounded-lg border-2 border-navy/30 px-3 text-sm text-navy"
        >
          {(Object.keys(FIELD_LABELS) as SearchField[]).map((key) => (
            <option key={key} value={key}>
              {FIELD_LABELS[key]}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="attendance-search-term">
          Search term
        </label>
        <input
          id="attendance-search-term"
          type="text"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          className="min-h-11 flex-1 rounded-lg border-2 border-navy/30 px-3 text-sm text-navy"
          placeholder={`Search by ${FIELD_LABELS[field].toLowerCase()}`}
          autoComplete="off"
        />
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-navy px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Search
        </button>
      </form>
      <p className="mt-2 text-xs text-navy/60">
        Results update as you type. Email and phone search are not supported.
      </p>

      <fieldset className="mt-4 border-t border-navy/10 pt-3">
        <legend className="text-sm font-semibold text-navy">Filters</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs font-semibold text-navy/80">
            Attendance
            <select
              className={SELECT_CLASS}
              value={filters.attendanceStatus}
              onChange={(event) =>
                setFilter(
                  "attendanceStatus",
                  event.target
                    .value as AttendanceFilters["attendanceStatus"]
                )
              }
            >
              {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-navy/80">
            Registration
            <select
              className={SELECT_CLASS}
              value={filters.registrationStatus}
              onChange={(event) =>
                setFilter(
                  "registrationStatus",
                  event.target
                    .value as AttendanceFilters["registrationStatus"]
                )
              }
            >
              {REGISTRATION_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-navy/80">
            Ticket
            <select
              className={SELECT_CLASS}
              value={filters.ticketStatus}
              onChange={(event) =>
                setFilter(
                  "ticketStatus",
                  event.target.value as AttendanceFilters["ticketStatus"]
                )
              }
            >
              {TICKET_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-navy/80">
            RSVP
            <select
              className={SELECT_CLASS}
              value={filters.rsvpStatus}
              onChange={(event) =>
                setFilter(
                  "rsvpStatus",
                  event.target.value as AttendanceFilters["rsvpStatus"]
                )
              }
            >
              {RSVP_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-navy/80">
            Environment
            <select
              className={SELECT_CLASS}
              value={filters.environment}
              onChange={(event) =>
                setFilter(
                  "environment",
                  event.target.value as AttendanceFilters["environment"]
                )
              }
            >
              {ENVIRONMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            disabled={filtersAreDefault(filters)}
            className="min-h-9 rounded-lg border-2 border-navy bg-white px-3 py-1.5 text-xs font-semibold text-navy disabled:opacity-40"
          >
            Reset Filters
          </button>
          <p className="text-xs text-navy/60">
            Signed up means an RSVP registration exists. Not signed up cannot be
            calculated until the complete invitation roster is imported.
          </p>
        </div>
      </fieldset>

      {hint !== null && (
        <p className="mt-3 text-sm text-navy/70">{hint}</p>
      )}

      {errorMessage !== null && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-900">
          {errorMessage}
        </p>
      )}

      <div className="mt-3" aria-live="polite">
        {searching && <p className="text-sm text-navy/70">Searching...</p>}
        {!searching && view !== null && (
          <AttendanceSearchResults
            results={view.results}
            matched={view.matched}
            truncated={view.truncated}
            onView={onView}
            onManual={onManual}
            onCorrect={onCorrect}
          />
        )}
      </div>
    </section>
  );
}
