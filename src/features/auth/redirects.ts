/**
 * Safe post-login redirect handling. Only relative, same-application paths
 * are accepted so an attacker can never bounce a staff member to an
 * external site through the next parameter.
 */

import { CHANGE_PASSWORD_PATH, LOGIN_PATH, STAFF_HOME_PATH } from "./constants";

const MAX_NEXT_LENGTH = 512;

/** Matches whitespace and ASCII control characters, which never belong in a path. */
const UNSAFE_CHARACTERS = /[\s\u0000-\u001f\u007f]/;

/**
 * Returns a safe relative destination. Anything that is not a plain
 * single-slash path inside this application falls back to /staff.
 */
export function sanitizeNextPath(raw: unknown): string {
  if (typeof raw !== "string") {
    return STAFF_HOME_PATH;
  }
  const value = raw.trim();
  if (
    value.length === 0 ||
    value.length > MAX_NEXT_LENGTH ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("://") ||
    value.includes("\\") ||
    UNSAFE_CHARACTERS.test(value)
  ) {
    return STAFF_HOME_PATH;
  }
  // Never bounce back into the login page.
  if (value === LOGIN_PATH || value.startsWith(`${LOGIN_PATH}?`)) {
    return STAFF_HOME_PATH;
  }
  return value;
}

/**
 * Final destination after a fully authorized login. A required password
 * change always wins over the requested next path.
 */
export function loginDestination(
  mustChangePassword: boolean,
  next: unknown
): string {
  if (mustChangePassword) {
    return CHANGE_PASSWORD_PATH;
  }
  return sanitizeNextPath(next);
}

/** Builds the login URL that preserves a safe relative return path. */
export function loginRedirectPath(currentPath: string): string {
  const next = sanitizeNextPath(currentPath);
  if (next === STAFF_HOME_PATH) {
    return LOGIN_PATH;
  }
  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}
