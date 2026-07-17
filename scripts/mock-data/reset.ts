/**
 * Full mock-data reset.
 *
 * Guarded destructive command for development only. It resolves exactly one
 * event, the fictional GRAD-2026-DEV event, verifies it is marked is_test
 * true, deletes it so foreign-key cascades remove its mock registrations,
 * guests, tickets and check-ins, then reseeds the fixtures. No code path
 * can delete all records or target any other event. Output is counts only.
 */

import {
  createEventLookup,
  createScriptAdminClient,
  loadLocalEnv,
  type AdminClient,
} from "./db";
import { mockRegistrations } from "./fixtures";
import {
  assertResetEnvGuards,
  verifyTargetTestEvent,
} from "./reset-guards";
import { seedMockData } from "./seed";

async function assertNoNonTestChildRecords(
  client: AdminClient,
  eventId: string
): Promise<void> {
  const { count, error } = await client
    .from("graduation_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("is_test", false);

  if (error) {
    throw new Error(
      `Reset aborted: could not verify registrations are test records: ${error.message}`
    );
  }
  if ((count ?? 0) > 0) {
    throw new Error(
      "Reset aborted: the development event contains registrations that are not marked is_test."
    );
  }
}

async function main(): Promise<void> {
  loadLocalEnv();

  // Guard 1: environment configuration must match the approved development
  // reset configuration exactly. Nothing destructive runs before this.
  assertResetEnvGuards({
    APP_ENV: process.env.APP_ENV,
    ALLOW_DESTRUCTIVE_DEV_RESET: process.env.ALLOW_DESTRUCTIVE_DEV_RESET,
    DEV_RESET_CONFIRMATION: process.env.DEV_RESET_CONFIRMATION,
    MOCK_EVENT_CODE: process.env.MOCK_EVENT_CODE,
  });

  const client = createScriptAdminClient();

  // Guard 2: the database event must be the development event and must be
  // marked as test data.
  const check = await verifyTargetTestEvent(createEventLookup(client));
  if (check.status === "missing") {
    console.log("Nothing to reset: the development event does not exist.");
    return;
  }

  // Guard 3: no non-test registration may hang off the development event.
  await assertNoNonTestChildRecords(client, check.event.id);

  // All guards passed. Delete the single verified test event and let
  // cascades remove its dependent mock records.
  const { count: deletedCount, error: deleteError } = await client
    .from("graduation_events")
    .delete({ count: "exact" })
    .eq("id", check.event.id)
    .eq("is_test", true);

  if (deleteError) {
    throw new Error(`Reset failed while deleting: ${deleteError.message}`);
  }

  const counts = await seedMockData(client);

  console.log(
    `Mock reset complete: ${deletedCount ?? 0} test event deleted with cascades, ` +
      `${counts.events} event, ${counts.registrations} of ${mockRegistrations.length} ` +
      `registrations and ${counts.guests} guest rows reseeded.`
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Reset failed.");
  process.exitCode = 1;
});
