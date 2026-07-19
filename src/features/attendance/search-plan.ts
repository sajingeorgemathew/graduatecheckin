/**
 * Pure planning for the live registration search. Given the selected field
 * and the raw text a supervisor has typed, it decides whether a request
 * should run, whether it should run immediately or after the debounce, and
 * what safe hint to show. It never performs a request, reads storage or logs
 * the term, so it is fully unit-testable and safe to import in the browser.
 *
 * A complete, exactly formatted ticket code searches immediately. Name and
 * source-registration-id searches wait for the debounce and require a minimum
 * length. Filters can also drive results, which the caller decides; this
 * module only plans the text-driven part.
 */

import {
  MIN_NAME_SEARCH_LENGTH,
  MIN_SOURCE_ID_SEARCH_LENGTH,
} from "./constants";

export type SearchField = "name" | "ticket_code" | "source_id";

/**
 * Client-safe copy of the ticket-code format. The authoritative validator
 * lives in the tickets feature but imports node:crypto, so it cannot be
 * bundled for the browser; this pattern only gates when a live search fires
 * and the server always revalidates the code.
 */
const TICKET_CODE_COMPLETE =
  /^GR26-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

export interface SearchPlan {
  /** Whether a request should be issued for this term. */
  shouldSearch: boolean;
  /** When true, search now; when false, search after the debounce. */
  immediate: boolean;
  /** The trimmed, normalized term to send. */
  term: string;
  /** A safe hint shown when a request is not yet issued, or null. */
  hint: string | null;
}

/**
 * Plans the text-driven search for a field and raw input. Only whitespace,
 * an empty field or a below-minimum length suppress a request; a complete
 * ticket code triggers an immediate search.
 */
export function planSearch(field: SearchField, raw: string): SearchPlan {
  const term = raw.trim();

  if (term.length === 0) {
    return { shouldSearch: false, immediate: false, term, hint: null };
  }

  if (field === "ticket_code") {
    const normalized = term.toUpperCase();
    if (TICKET_CODE_COMPLETE.test(normalized)) {
      return {
        shouldSearch: true,
        immediate: true,
        term: normalized,
        hint: null,
      };
    }
    return {
      shouldSearch: false,
      immediate: false,
      term: normalized,
      hint: "Enter the complete ticket code, for example GR26-ABCD-EFGH.",
    };
  }

  if (field === "name") {
    if (term.length < MIN_NAME_SEARCH_LENGTH) {
      return {
        shouldSearch: false,
        immediate: false,
        term,
        hint: "Enter at least two characters to search by name.",
      };
    }
    return { shouldSearch: true, immediate: false, term, hint: null };
  }

  // source_id
  if (term.length < MIN_SOURCE_ID_SEARCH_LENGTH) {
    return {
      shouldSearch: false,
      immediate: false,
      term,
      hint: "Enter at least two characters to search by source registration ID.",
    };
  }
  return { shouldSearch: true, immediate: false, term, hint: null };
}
