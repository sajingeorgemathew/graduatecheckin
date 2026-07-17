/**
 * Idempotent development seed script.
 *
 * Upserts the fictional development event, its 20 mock registrations and
 * their guest detail rows using the service-role admin client. It never
 * deletes anything, never creates tickets, check-ins or Auth users, and
 * prints counts only. Names, emails, phones, IDs and credentials must
 * never appear in output.
 */

import type {
  GraduationEventInsert,
  GraduationRegistrationInsert,
  RegistrationGuestInsert,
} from "../../src/types/database";
import {
  createScriptAdminClient,
  isMissingMigrationError,
  loadLocalEnv,
  MISSING_MIGRATION_MESSAGE,
  type AdminClient,
} from "./db";
import { mockEvent, mockGuests, mockRegistrations } from "./fixtures";

function assertAllTestRecords(): void {
  const records: Array<{ is_test: boolean }> = [
    mockEvent,
    ...mockRegistrations,
    ...mockGuests,
  ];
  if (records.some((record) => record.is_test !== true)) {
    throw new Error(
      "Seed aborted: every fixture record must be marked is_test true."
    );
  }
}

function raiseSeedError(step: string, error: {
  code: string | null;
  message: string;
}): never {
  if (isMissingMigrationError(error)) {
    throw new Error(MISSING_MIGRATION_MESSAGE);
  }
  throw new Error(`Seed failed while upserting ${step}: ${error.message}`);
}

export async function seedMockData(client: AdminClient): Promise<{
  events: number;
  registrations: number;
  guests: number;
}> {
  assertAllTestRecords();

  const eventRow: GraduationEventInsert = { ...mockEvent };
  const { error: eventError } = await client
    .from("graduation_events")
    .upsert([eventRow], { onConflict: "id" });
  if (eventError) {
    raiseSeedError("the development event", eventError);
  }

  const registrationRows: GraduationRegistrationInsert[] =
    mockRegistrations.map((registration) => ({ ...registration }));
  const { error: registrationError } = await client
    .from("graduation_registrations")
    .upsert(registrationRows, { onConflict: "id" });
  if (registrationError) {
    raiseSeedError("mock registrations", registrationError);
  }

  const guestRows: RegistrationGuestInsert[] = mockGuests.map((guest) => ({
    ...guest,
  }));
  const { error: guestError } = await client
    .from("registration_guests")
    .upsert(guestRows, { onConflict: "id" });
  if (guestError) {
    raiseSeedError("mock guest details", guestError);
  }

  return {
    events: 1,
    registrations: registrationRows.length,
    guests: guestRows.length,
  };
}

async function main(): Promise<void> {
  loadLocalEnv();
  const client = createScriptAdminClient();
  const counts = await seedMockData(client);
  console.log(
    `Mock seed complete: ${counts.events} event, ` +
      `${counts.registrations} registrations, ${counts.guests} guest rows upserted.`
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Seed failed.");
  process.exitCode = 1;
});
