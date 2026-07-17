/**
 * Check-in-only reset.
 *
 * Guarded destructive command for development only. It deletes check-in
 * audit rows that belong to registrations of the fictional GRAD-2026-DEV
 * test event and preserves the event, registrations, guests and tickets.
 * Only rows marked is_test true are deleted. Output is a count only.
 */

import {
  createEventLookup,
  createScriptAdminClient,
  loadLocalEnv,
  type AdminClient,
} from "./db";
import {
  assertResetEnvGuards,
  verifyTargetTestEvent,
} from "./reset-guards";

async function fetchTestRegistrationIds(
  client: AdminClient,
  eventId: string
): Promise<string[]> {
  const { data, error } = await client
    .from("graduation_registrations")
    .select("id, is_test")
    .eq("event_id", eventId);

  if (error) {
    throw new Error(
      `Check-in reset aborted: could not load registrations: ${error.message}`
    );
  }

  const rows = data ?? [];
  if (rows.some((row) => row.is_test !== true)) {
    throw new Error(
      "Check-in reset aborted: the development event contains registrations that are not marked is_test."
    );
  }
  return rows.map((row) => row.id);
}

async function main(): Promise<void> {
  loadLocalEnv();

  // Guard 1: exact development environment configuration required.
  assertResetEnvGuards({
    APP_ENV: process.env.APP_ENV,
    ALLOW_DESTRUCTIVE_DEV_RESET: process.env.ALLOW_DESTRUCTIVE_DEV_RESET,
    DEV_RESET_CONFIRMATION: process.env.DEV_RESET_CONFIRMATION,
    MOCK_EVENT_CODE: process.env.MOCK_EVENT_CODE,
  });

  const client = createScriptAdminClient();

  // Guard 2: the database event must be the development test event.
  const check = await verifyTargetTestEvent(createEventLookup(client));
  if (check.status === "missing") {
    console.log("Nothing to reset: the development event does not exist.");
    return;
  }

  // Guard 3: every registration under the event must be test data.
  const registrationIds = await fetchTestRegistrationIds(
    client,
    check.event.id
  );
  if (registrationIds.length === 0) {
    console.log("Check-in reset complete: 0 check-in rows deleted.");
    return;
  }

  // All guards passed. Delete only test check-in rows belonging to the
  // verified mock registrations.
  const { count, error } = await client
    .from("graduation_checkins")
    .delete({ count: "exact" })
    .in("registration_id", registrationIds)
    .eq("is_test", true);

  if (error) {
    throw new Error(`Check-in reset failed: ${error.message}`);
  }

  console.log(`Check-in reset complete: ${count ?? 0} check-in rows deleted.`);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Check-in reset failed."
  );
  process.exitCode = 1;
});
