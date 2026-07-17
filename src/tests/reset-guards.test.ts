import { describe, expect, it } from "vitest";

import {
  assertResetEnvGuards,
  checkResetEnvGuards,
  REQUIRED_CONFIRMATION,
  REQUIRED_MOCK_EVENT_CODE,
  verifyTargetTestEvent,
  type EventLookupClient,
  type ResetGuardEnv,
  type TargetEventRecord,
} from "../../scripts/mock-data/reset-guards";

const approvedEnv: ResetGuardEnv = {
  APP_ENV: "development",
  ALLOW_DESTRUCTIVE_DEV_RESET: "true",
  DEV_RESET_CONFIRMATION: REQUIRED_CONFIRMATION,
  MOCK_EVENT_CODE: REQUIRED_MOCK_EVENT_CODE,
};

function lookupReturning(
  event: TargetEventRecord | null
): EventLookupClient {
  return {
    fetchEventByCode: () => Promise.resolve(event),
  };
}

describe("reset environment guards", () => {
  it("accepts only the complete approved development configuration", () => {
    const result = checkResetEnvGuards(approvedEnv);
    expect(result.allowed).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(() => assertResetEnvGuards(approvedEnv)).not.toThrow();
  });

  it("rejects a production environment", () => {
    const result = checkResetEnvGuards({
      ...approvedEnv,
      APP_ENV: "production",
    });
    expect(result.allowed).toBe(false);
    expect(result.failures.join(" ")).toContain("APP_ENV");
  });

  it("rejects a missing reset permission", () => {
    const result = checkResetEnvGuards({
      ...approvedEnv,
      ALLOW_DESTRUCTIVE_DEV_RESET: undefined,
    });
    expect(result.allowed).toBe(false);
    expect(result.failures.join(" ")).toContain(
      "ALLOW_DESTRUCTIVE_DEV_RESET"
    );
  });

  it("rejects a false reset permission", () => {
    const result = checkResetEnvGuards({
      ...approvedEnv,
      ALLOW_DESTRUCTIVE_DEV_RESET: "false",
    });
    expect(result.allowed).toBe(false);
  });

  it("rejects a missing confirmation", () => {
    const result = checkResetEnvGuards({
      ...approvedEnv,
      DEV_RESET_CONFIRMATION: undefined,
    });
    expect(result.allowed).toBe(false);
    expect(result.failures.join(" ")).toContain("DEV_RESET_CONFIRMATION");
  });

  it("rejects an incorrect confirmation", () => {
    const result = checkResetEnvGuards({
      ...approvedEnv,
      DEV_RESET_CONFIRMATION: "reset_graduation_checkin_dev_data",
    });
    expect(result.allowed).toBe(false);
  });

  it("rejects a wrong event code", () => {
    const result = checkResetEnvGuards({
      ...approvedEnv,
      MOCK_EVENT_CODE: "GRAD-2026-PROD",
    });
    expect(result.allowed).toBe(false);
    expect(result.failures.join(" ")).toContain("MOCK_EVENT_CODE");
  });

  it("throws with variable names only when blocked", () => {
    expect(() =>
      assertResetEnvGuards({
        APP_ENV: "production",
        ALLOW_DESTRUCTIVE_DEV_RESET: "false",
        DEV_RESET_CONFIRMATION: "",
        MOCK_EVENT_CODE: "",
      })
    ).toThrow(/Destructive reset blocked/);
  });
});

describe("target event database guard", () => {
  it("reports missing when the development event does not exist", async () => {
    const check = await verifyTargetTestEvent(lookupReturning(null));
    expect(check.status).toBe("missing");
  });

  it("rejects a database event marked as non-test", async () => {
    await expect(
      verifyTargetTestEvent(
        lookupReturning({
          id: "00000000-0000-4000-8000-000000000001",
          event_code: REQUIRED_MOCK_EVENT_CODE,
          is_test: false,
        })
      )
    ).rejects.toThrow(/not marked is_test/);
  });

  it("rejects an event whose stored code differs from the development code", async () => {
    await expect(
      verifyTargetTestEvent(
        lookupReturning({
          id: "00000000-0000-4000-8000-000000000001",
          event_code: "GRAD-2026-REAL",
          is_test: true,
        })
      )
    ).rejects.toThrow(/does not match/);
  });

  it("accepts only the development event marked as test data", async () => {
    const check = await verifyTargetTestEvent(
      lookupReturning({
        id: "00000000-0000-4000-8000-000000000001",
        event_code: REQUIRED_MOCK_EVENT_CODE,
        is_test: true,
      })
    );
    expect(check.status).toBe("ok");
    if (check.status === "ok") {
      expect(check.event.event_code).toBe(REQUIRED_MOCK_EVENT_CODE);
    }
  });

  it("only ever queries the fixed development event code", async () => {
    const requestedCodes: string[] = [];
    const client: EventLookupClient = {
      fetchEventByCode: (eventCode: string) => {
        requestedCodes.push(eventCode);
        return Promise.resolve(null);
      },
    };
    await verifyTargetTestEvent(client);
    expect(requestedCodes).toEqual([REQUIRED_MOCK_EVENT_CODE]);
  });
});
