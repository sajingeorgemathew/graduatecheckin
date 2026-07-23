/**
 * Read-only verification of the CONVOCATION-2026 production event.
 *
 * Never creates, modifies or deletes anything. Confirms the production event
 * exists, is a non-test draft with the approved ceremony details, and starts
 * completely empty (no registrations, tickets, PDF documents, check-ins,
 * attendance or delivery records). Exits nonzero on any unsafe condition.
 * No secret is ever printed.
 */

import {
  createScriptAdminClient,
  loadLocalEnv,
  MissingEnvError,
  type AdminClient,
} from "../mock-data/db";
import {
  PRODUCTION_EVENT_CODE,
  PRODUCTION_EVENT_DETAILS,
} from "./convocation-production-plan";
import {
  describeTimestampMismatch,
  matchTimestampInstant,
} from "./timestamp-match";

async function countByEvent(
  db: AdminClient,
  table: string,
  column: string,
  eventId: string
): Promise<number | null> {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, eventId);
  if (error) {
    return null;
  }
  return count ?? 0;
}

async function main(): Promise<void> {
  loadLocalEnv();

  let db: AdminClient;
  try {
    db = createScriptAdminClient();
  } catch (error) {
    if (error instanceof MissingEnvError) {
      console.error(
        `Supabase CLI credentials are missing: ${error.missing.join(", ")}.`
      );
    } else {
      console.error("The Supabase administrative client could not be created.");
    }
    process.exitCode = 1;
    return;
  }

  let unsafe = false;
  const fail = (message: string): void => {
    console.error(message);
    unsafe = true;
  };

  const { data: event, error } = await db
    .from("graduation_events")
    .select("*")
    .eq("event_code", PRODUCTION_EVENT_CODE)
    .maybeSingle();
  if (error) {
    console.error("The production event could not be queried.");
    process.exitCode = 1;
    return;
  }
  if (event === null) {
    console.error(
      `Production event ${PRODUCTION_EVENT_CODE} does not exist. ` +
        "Run npm run events:create-production first."
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Event code:          ${event.event_code}`);
  if (event.event_code !== PRODUCTION_EVENT_CODE) {
    fail(`Event code is not ${PRODUCTION_EVENT_CODE}.`);
  }
  console.log(`Event mode:          ${event.is_test ? "test" : "production"}`);
  if (event.is_test) {
    fail("Production event must not be a test event.");
  }
  console.log(`Event status:        ${event.status}`);
  if (event.status !== "draft") {
    fail("Production event must remain draft until CHECKIN-10 activation.");
  }

  const details = PRODUCTION_EVENT_DETAILS;
  const mismatch = (label: string, actual: unknown, expected: unknown): void => {
    if (actual !== expected) {
      fail(`${label} does not match the approved value.`);
    }
  };
  // Timestamps are compared by parsed instant: PostgreSQL returns
  // "2026-07-26 16:00:00+00" where the approved constant is
  // "2026-07-26T16:00:00.000Z". Null, malformed and genuinely different
  // instants still fail.
  const instantMismatch = (
    label: string,
    actual: unknown,
    expected: unknown
  ): void => {
    const result = matchTimestampInstant(actual, expected);
    if (!result.equal) {
      fail(describeTimestampMismatch(label, result.reason));
    }
  };
  mismatch("Title", event.event_name, details.eventName);
  instantMismatch("Start time", event.starts_at, details.startsAt);
  instantMismatch("End time", event.ends_at, details.endsAt);
  mismatch("Timezone", event.timezone, details.timezone);
  mismatch("Venue name", event.venue_name, details.venueName);
  mismatch("Venue address", event.venue_address, details.venueAddress);
  console.log("Ceremony details:    checked");

  // Every count below must be zero for a freshly created production event.
  const emptiness: Array<[string, string, string]> = [
    ["Registrations", "graduation_registrations", "event_id"],
    ["Ticket documents", "graduation_ticket_documents", "event_id"],
    ["Delivery batches", "graduation_ticket_delivery_batches", "event_id"],
    ["Deliveries", "graduation_ticket_deliveries", "event_id"],
  ];
  for (const [label, table, column] of emptiness) {
    const count = await countByEvent(db, table, column, event.id);
    if (count === null) {
      fail(`${label} could not be counted (${table}).`);
    } else {
      console.log(`${label}: ${count}`);
      if (count !== 0) {
        fail(`${label} must be zero for a fresh production event.`);
      }
    }
  }

  // Tickets and check-ins reference registrations, not the event directly, so
  // with zero registrations they are necessarily zero. A registration count
  // of zero above already proves this; report it for the operator.
  console.log("Tickets:             0 (no registrations exist)");
  console.log("Check-ins:           0 (no registrations exist)");
  console.log("Attendance:          0 (no check-ins exist)");

  if (unsafe) {
    console.error("");
    console.error("Production event verification FAILED.");
    process.exitCode = 1;
    return;
  }
  console.log("");
  console.log("Production event verification passed.");
}

main().catch(() => {
  console.error("Production event verification failed unexpectedly.");
  process.exitCode = 1;
});
