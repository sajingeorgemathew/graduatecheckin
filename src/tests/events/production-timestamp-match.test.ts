/**
 * Instant-based timestamp comparison for the CONVOCATION-2026 verifier.
 *
 * PostgreSQL renders the stored timestamptz as "2026-07-26 16:00:00+00" while
 * the approved constants are ISO-8601 with milliseconds. Those must compare
 * equal, while null, malformed values and genuinely different instants must
 * still fail.
 */

import { describe, expect, it } from "vitest";

import { PRODUCTION_EVENT_DETAILS } from "../../../scripts/events/convocation-production-plan";
import {
  matchTimestampInstant,
  parseTimestampInstant,
} from "../../../scripts/events/timestamp-match";

describe("matchTimestampInstant equivalent UTC formats", () => {
  it("treats the approved start as equal to the PostgreSQL rendering", () => {
    expect(
      matchTimestampInstant("2026-07-26 16:00:00+00", "2026-07-26T16:00:00.000Z")
    ).toEqual({ equal: true });
  });

  it("treats the approved end as equal to the PostgreSQL rendering", () => {
    expect(
      matchTimestampInstant("2026-07-26 20:00:00+00", "2026-07-26T20:00:00.000Z")
    ).toEqual({ equal: true });
  });

  it("accepts other renderings of the same instant", () => {
    for (const actual of [
      "2026-07-26T16:00:00Z",
      "2026-07-26 16:00:00+0000",
      "2026-07-26 16:00:00+00:00",
      "2026-07-26 12:00:00-04:00",
      "2026-07-26T16:00:00.000000+00",
    ]) {
      expect(
        matchTimestampInstant(actual, "2026-07-26T16:00:00.000Z")
      ).toEqual({ equal: true });
    }
  });

  it("passes for the approved production start and end values", () => {
    expect(
      matchTimestampInstant(
        "2026-07-26 16:00:00+00",
        PRODUCTION_EVENT_DETAILS.startsAt
      )
    ).toEqual({ equal: true });
    expect(
      matchTimestampInstant(
        "2026-07-26 20:00:00+00",
        PRODUCTION_EVENT_DETAILS.endsAt
      )
    ).toEqual({ equal: true });
    expect(parseTimestampInstant(PRODUCTION_EVENT_DETAILS.startsAt)).toBe(
      Date.UTC(2026, 6, 26, 16, 0, 0)
    );
    expect(parseTimestampInstant(PRODUCTION_EVENT_DETAILS.endsAt)).toBe(
      Date.UTC(2026, 6, 26, 20, 0, 0)
    );
  });
});

describe("matchTimestampInstant rejects real differences", () => {
  it("fails on a genuinely different minute", () => {
    expect(
      matchTimestampInstant("2026-07-26 16:01:00+00", "2026-07-26T16:00:00.000Z")
    ).toEqual({ equal: false, reason: "different-instant" });
    expect(
      matchTimestampInstant("2026-07-26 19:59:00+00", "2026-07-26T20:00:00.000Z")
    ).toEqual({ equal: false, reason: "different-instant" });
  });

  it("fails on a different day, hour or offset", () => {
    for (const actual of [
      "2026-07-27 16:00:00+00",
      "2026-07-26 17:00:00+00",
      "2026-07-26 16:00:00+01",
      "2026-07-26 16:00:00.500+00",
    ]) {
      expect(
        matchTimestampInstant(actual, "2026-07-26T16:00:00.000Z")
      ).toEqual({ equal: false, reason: "different-instant" });
    }
  });

  it("fails when the actual value is null or undefined", () => {
    expect(
      matchTimestampInstant(null, "2026-07-26T16:00:00.000Z")
    ).toEqual({ equal: false, reason: "missing" });
    expect(
      matchTimestampInstant(undefined, "2026-07-26T16:00:00.000Z")
    ).toEqual({ equal: false, reason: "missing" });
  });

  it("fails when the actual value is malformed", () => {
    for (const actual of [
      "",
      "   ",
      "not-a-timestamp",
      "2026-07-26",
      "2026-13-26 16:00:00+00",
      "2026-02-30 16:00:00+00",
      "2026-07-26 25:00:00+00",
      1_000,
      {},
    ]) {
      expect(
        matchTimestampInstant(actual, "2026-07-26T16:00:00.000Z")
      ).toEqual({ equal: false, reason: "malformed-actual" });
    }
  });

  it("fails when the timestamp carries no explicit UTC offset", () => {
    // A local-looking timestamp names no single instant, so it cannot be
    // silently accepted as matching.
    expect(
      matchTimestampInstant("2026-07-26 16:00:00", "2026-07-26T16:00:00.000Z")
    ).toEqual({ equal: false, reason: "malformed-actual" });
  });

  it("fails when the expected constant is malformed", () => {
    expect(matchTimestampInstant("2026-07-26 16:00:00+00", "later")).toEqual({
      equal: false,
      reason: "malformed-expected",
    });
    expect(matchTimestampInstant("2026-07-26 16:00:00+00", null)).toEqual({
      equal: false,
      reason: "malformed-expected",
    });
  });
});
