/**
 * Safety guards for destructive development reset commands.
 *
 * Destructive operations may only run when every environment guard passes
 * and the database confirms the target is the fictional development event
 * marked is_test true. There is no code path that can delete all records
 * or target an arbitrary event code.
 */

export const REQUIRED_APP_ENV = "development";
export const REQUIRED_CONFIRMATION = "RESET_GRADUATION_CHECKIN_DEV_DATA";
export const REQUIRED_MOCK_EVENT_CODE = "GRAD-2026-DEV";

export interface ResetGuardEnv {
  APP_ENV: string | undefined;
  ALLOW_DESTRUCTIVE_DEV_RESET: string | undefined;
  DEV_RESET_CONFIRMATION: string | undefined;
  MOCK_EVENT_CODE: string | undefined;
}

export interface GuardResult {
  allowed: boolean;
  failures: string[];
}

/**
 * Pure environment guard. Rejects unless every condition matches exactly.
 * Failure messages name the variable only and never echo its value.
 */
export function checkResetEnvGuards(env: ResetGuardEnv): GuardResult {
  const failures: string[] = [];

  if (env.APP_ENV !== REQUIRED_APP_ENV) {
    failures.push("APP_ENV must be exactly 'development'.");
  }
  if (env.ALLOW_DESTRUCTIVE_DEV_RESET !== "true") {
    failures.push("ALLOW_DESTRUCTIVE_DEV_RESET must be exactly 'true'.");
  }
  if (env.DEV_RESET_CONFIRMATION !== REQUIRED_CONFIRMATION) {
    failures.push(
      `DEV_RESET_CONFIRMATION must be exactly '${REQUIRED_CONFIRMATION}'.`
    );
  }
  if (env.MOCK_EVENT_CODE !== REQUIRED_MOCK_EVENT_CODE) {
    failures.push(
      `MOCK_EVENT_CODE must be exactly '${REQUIRED_MOCK_EVENT_CODE}'.`
    );
  }

  return { allowed: failures.length === 0, failures };
}

export function assertResetEnvGuards(env: ResetGuardEnv): void {
  const result = checkResetEnvGuards(env);
  if (!result.allowed) {
    throw new Error(
      `Destructive reset blocked:\n- ${result.failures.join("\n- ")}`
    );
  }
}

export interface TargetEventRecord {
  id: string;
  event_code: string;
  is_test: boolean;
}

/**
 * Minimal query surface so the database guard can be tested without a real
 * Supabase connection. The admin client satisfies this shape.
 */
export interface EventLookupClient {
  fetchEventByCode(eventCode: string): Promise<TargetEventRecord | null>;
}

export type TargetEventCheck =
  | { status: "ok"; event: TargetEventRecord }
  | { status: "missing" };

/**
 * Database guard. Resolves only the fixed development event code and
 * requires the stored event to be marked as test data. Throws immediately
 * when the event exists but is not a test record.
 */
export async function verifyTargetTestEvent(
  client: EventLookupClient
): Promise<TargetEventCheck> {
  const event = await client.fetchEventByCode(REQUIRED_MOCK_EVENT_CODE);

  if (event === null) {
    return { status: "missing" };
  }
  if (event.event_code !== REQUIRED_MOCK_EVENT_CODE) {
    throw new Error(
      "Destructive reset blocked: resolved event code does not match the development event code."
    );
  }
  if (event.is_test !== true) {
    throw new Error(
      "Destructive reset blocked: the target event is not marked is_test. Refusing to touch a non-test event."
    );
  }

  return { status: "ok", event };
}
