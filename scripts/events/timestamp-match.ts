/**
 * Runtime-neutral instant comparison for production-event timestamps.
 *
 * PostgreSQL renders `timestamptz` as `2026-07-26 16:00:00+00` while the
 * approved constants are ISO-8601 (`2026-07-26T16:00:00.000Z`). Those are the
 * same instant, so the verifier must compare parsed instants rather than raw
 * strings. Parsing is deliberately strict: an explicit UTC offset is required,
 * because a timestamp without one names no single instant. Anything that does
 * not parse is reported as malformed and fails verification — this helper never
 * makes a comparison succeed that a strict reading would reject.
 *
 * This module contains no database access and no secret, so both the verify
 * script and its tests can import it.
 */

const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|z|[+-]\d{2}(?::?\d{2})?)$/;

/**
 * Parses an ISO-8601 or PostgreSQL UTC-offset timestamp into epoch
 * milliseconds. Returns null when the value is not a string, does not match the
 * accepted shape, carries no explicit offset, or names a date that does not
 * exist (for example 2026-02-30).
 */
export function parseTimestampInstant(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = TIMESTAMP_PATTERN.exec(value.trim());
  if (match === null) {
    return null;
  }

  const [, year, month, day, hour, minute, second, fraction, offset] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const secondNumber = second === undefined ? 0 : Number(second);
  const millisecond =
    fraction === undefined ? 0 : Number(fraction.padEnd(3, "0").slice(0, 3));

  if (monthNumber < 1 || monthNumber > 12) {
    return null;
  }
  if (dayNumber < 1 || dayNumber > 31) {
    return null;
  }
  if (hourNumber > 23 || minuteNumber > 59 || secondNumber > 59) {
    return null;
  }

  const offsetMinutes = parseOffsetMinutes(offset);
  if (offsetMinutes === null) {
    return null;
  }

  const utc = Date.UTC(
    yearNumber,
    monthNumber - 1,
    dayNumber,
    hourNumber,
    minuteNumber,
    secondNumber,
    millisecond
  );
  if (Number.isNaN(utc)) {
    return null;
  }
  // Date.UTC rolls impossible dates forward (Feb 30 becomes Mar 2); reject
  // anything that did not survive the round trip unchanged.
  const roundTrip = new Date(utc);
  if (
    roundTrip.getUTCFullYear() !== yearNumber ||
    roundTrip.getUTCMonth() !== monthNumber - 1 ||
    roundTrip.getUTCDate() !== dayNumber
  ) {
    return null;
  }

  return utc - offsetMinutes * 60_000;
}

function parseOffsetMinutes(offset: string): number | null {
  if (offset === "Z" || offset === "z") {
    return 0;
  }
  const sign = offset.startsWith("-") ? -1 : 1;
  const digits = offset.slice(1).replace(":", "");
  const hours = Number(digits.slice(0, 2));
  const minutes = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return sign * (hours * 60 + minutes);
}

export type TimestampMatch =
  | { equal: true }
  | {
      equal: false;
      reason: "missing" | "malformed-actual" | "malformed-expected" | "different-instant";
    };

/**
 * Compares a database timestamp against an approved constant by instant.
 * A null/undefined actual value, an unparseable value on either side, and a
 * genuinely different instant all fail.
 */
export function matchTimestampInstant(
  actual: unknown,
  expected: unknown
): TimestampMatch {
  if (actual === null || actual === undefined) {
    return { equal: false, reason: "missing" };
  }
  const expectedInstant = parseTimestampInstant(expected);
  if (expectedInstant === null) {
    return { equal: false, reason: "malformed-expected" };
  }
  const actualInstant = parseTimestampInstant(actual);
  if (actualInstant === null) {
    return { equal: false, reason: "malformed-actual" };
  }
  if (actualInstant !== expectedInstant) {
    return { equal: false, reason: "different-instant" };
  }
  return { equal: true };
}

/** Human-readable explanation for a failed timestamp comparison. */
export function describeTimestampMismatch(
  label: string,
  reason: Exclude<TimestampMatch, { equal: true }>["reason"]
): string {
  switch (reason) {
    case "missing":
      return `${label} is missing in the production event.`;
    case "malformed-actual":
      return `${label} in the production event is not a valid timestamp.`;
    case "malformed-expected":
      return `${label} in the approved constants is not a valid timestamp.`;
    case "different-instant":
      return `${label} does not match the approved value.`;
  }
}
