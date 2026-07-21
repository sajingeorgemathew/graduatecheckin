/**
 * Configures the active graduation event for Convocation Ceremony 2026 and
 * writes its branded-ticket presentation settings.
 *
 * Usage:
 *   npm run tickets:configure-event              apply the configuration
 *   npm run tickets:configure-event -- --dry-run resolve and report only
 *
 * Safety contract:
 *  - Idempotent. Running it repeatedly converges on the same state and
 *    reports "no change" once everything matches.
 *  - Updates event display information and ticket settings only.
 *  - Never changes the event code, the event mode, the draft/production
 *    status, attendance, registrations, tickets, ticket replacements,
 *    revocations or check-ins.
 *  - Never prints a secret. Only names, times, venue text and counts are
 *    echoed.
 *  - Dry-run makes no database writes at all.
 *  - Never runs automatically. An administrator invokes it deliberately.
 *
 * The event row keeps owning the schedule-independent facts (code, mode,
 * status, start and end timestamps, venue). The ticket-settings row owns
 * only what the printed PDF shows.
 *
 * This is a standalone tsx CLI script. It must not import a module chain
 * that contains `import "server-only"`; the target values and change
 * diffing live in the runtime-neutral ./configure-plan module and asset
 * resolution comes from ../../src/features/ticket-documents/assets.shared,
 * never ./assets.
 */

import {
  createScriptAdminClient,
  loadLocalEnv,
  MissingEnvError,
  type AdminClient,
} from "../mock-data/db";
import {
  publicAssetExists,
  resolvePrimaryLogoAssetName,
} from "../../src/features/ticket-documents/assets.shared";
import { serializeProgramSchedule } from "../../src/features/ticket-documents/presentation";
import {
  diffEventDisplay,
  diffTicketSettings,
  EVENT_ENDS_AT,
  EVENT_NAME,
  EVENT_STARTS_AT,
  EVENT_TIMEZONE,
  PROGRAM_SCHEDULE,
  TEMPLATE_VERSION,
  TICKET_DESCRIPTION,
  TICKET_INSTRUCTIONS,
  VENUE_ADDRESS,
  VENUE_NAME,
} from "./configure-plan";

/** Tables the configuration touches. Verified before any write is attempted. */
const REQUIRED_TABLES = [
  "graduation_events",
  "graduation_event_ticket_settings",
] as const;

interface PostgrestErrorLike {
  code?: string | null;
  message?: string;
}

/** True when the error means the CHECKIN-09A migration is not applied yet. */
function isMissingRelation(error: PostgrestErrorLike | null): boolean {
  if (error === null) {
    return false;
  }
  if (error.code === "42P01" || error.code === "PGRST205") {
    return true;
  }
  return /schema cache|does not exist|could not find the table/i.test(
    error.message ?? ""
  );
}

/** Confirms the tables the configuration writes to are reachable. */
async function verifyRequiredTables(db: AdminClient): Promise<boolean> {
  let ok = true;
  for (const table of REQUIRED_TABLES) {
    const { error } = await db.from(table).select("id").limit(1);
    if (error) {
      if (isMissingRelation(error)) {
        console.error(
          `Table ${table} was not found. Apply the CHECKIN-09A migration ` +
            "before configuring the event."
        );
      } else {
        console.error(`Table ${table} could not be queried.`);
      }
      ok = false;
    }
  }
  return ok;
}

async function main(): Promise<void> {
  const dryRun = process.argv.slice(2).includes("--dry-run");

  loadLocalEnv();

  const eventCode = (process.env.ACTIVE_GRADUATION_EVENT_CODE ?? "").trim();
  if (eventCode.length === 0) {
    console.error(
      "ACTIVE_GRADUATION_EVENT_CODE is not configured. Set it in .env.local."
    );
    process.exitCode = 1;
    return;
  }

  let db: AdminClient;
  try {
    db = createScriptAdminClient();
  } catch (error) {
    if (error instanceof MissingEnvError) {
      console.error(
        `Supabase CLI credentials are missing: ${error.missing.join(", ")}. ` +
          "Set them in .env.local before configuring the event."
      );
    } else {
      console.error(
        "The Supabase administrative client could not be created."
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(dryRun ? "Mode:                dry-run (no writes)" : "Mode: apply");
  console.log("");

  // ---- Required tables -------------------------------------------------
  if (!(await verifyRequiredTables(db))) {
    process.exitCode = 1;
    return;
  }

  // ---- Active event ----------------------------------------------------
  const { data: event, error: eventError } = await db
    .from("graduation_events")
    .select("*")
    .eq("event_code", eventCode)
    .maybeSingle();

  if (eventError) {
    console.error("The graduation event could not be loaded.");
    process.exitCode = 1;
    return;
  }
  if (event === null) {
    console.error(
      `No graduation event exists with code ${eventCode}. Seed or create it first.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Active event code:   ${eventCode}`);
  console.log(`Event status:        ${event.status} (preserved)`);
  console.log(`Test event:          ${event.is_test ? "yes" : "no"} (preserved)`);
  console.log("");

  // ---- Asset resolution ------------------------------------------------
  const logoAsset = resolvePrimaryLogoAssetName();
  if (publicAssetExists(logoAsset)) {
    console.log(`Primary logo asset:  ${logoAsset} (found)`);
  } else {
    console.error(
      `Primary logo asset ${logoAsset} was not found in public/. Add it ` +
        "before configuring the event."
    );
    process.exitCode = 1;
    return;
  }
  console.log("");

  // ---- Load existing ticket settings -----------------------------------
  const { data: existingSettings, error: settingsReadError } = await db
    .from("graduation_event_ticket_settings")
    .select("*")
    .eq("event_id", event.id)
    .maybeSingle();

  if (settingsReadError) {
    console.error("The ticket settings could not be loaded.");
    process.exitCode = 1;
    return;
  }

  // ---- Compute the idempotent plan -------------------------------------
  const eventChanges = diffEventDisplay(event);
  const settingsPlan = diffTicketSettings(existingSettings, logoAsset);
  const changes = [
    ...eventChanges.map((line) => `  ${line}`),
    ...settingsPlan.changes.map((line) => `  ${line}`),
  ];

  const desiredSettings = {
    event_id: event.id,
    display_title: EVENT_NAME,
    description: TICKET_DESCRIPTION,
    program_schedule: serializeProgramSchedule(PROGRAM_SCHEDULE),
    primary_logo_asset: logoAsset,
    secondary_asset: null,
    template_version: TEMPLATE_VERSION,
    instructions: TICKET_INSTRUCTIONS,
  };

  // ---- Report intended configuration -----------------------------------
  console.log("Intended configuration:");
  console.log(`  Title:      ${EVENT_NAME}`);
  console.log(`  Date:       Sunday, July 26, 2026`);
  console.log(`  Time:       12:00 PM to 4:00 PM (${EVENT_TIMEZONE})`);
  console.log(`  Venue:      ${VENUE_NAME}`);
  console.log(`  Address:    ${VENUE_ADDRESS}`);
  console.log(`  Schedule:   ${PROGRAM_SCHEDULE.length} entries`);
  console.log(`  Logo asset: ${logoAsset}`);
  console.log(`  Settings:   ${settingsPlan.action}`);
  console.log("");

  if (changes.length === 0) {
    console.log("No changes are needed. The configuration already matches.");
  } else {
    console.log(dryRun ? "Changes that would be applied:" : "Changes to apply:");
    for (const line of changes) {
      console.log(line);
    }
  }
  console.log("");

  // ---- Dry-run stops here (no writes) ----------------------------------
  if (dryRun) {
    console.log(
      "Dry-run complete. No database writes were made. " +
        "Registrations, tickets, check-ins and attendance were not touched."
    );
    return;
  }

  if (changes.length === 0) {
    console.log(
      "Registrations, tickets, check-ins and attendance were not modified."
    );
    console.log("Event configuration already complete.");
    return;
  }

  // ---- Apply event display information ----------------------------------
  // event_code, status and is_test are deliberately absent from this
  // update, so the event mode and draft/production state are preserved.
  const { error: updateError } = await db
    .from("graduation_events")
    .update({
      event_name: EVENT_NAME,
      starts_at: EVENT_STARTS_AT,
      ends_at: EVENT_ENDS_AT,
      timezone: EVENT_TIMEZONE,
      venue_name: VENUE_NAME,
      venue_address: VENUE_ADDRESS,
    })
    .eq("id", event.id);

  if (updateError) {
    console.error("The event display information could not be updated.");
    process.exitCode = 1;
    return;
  }

  // ---- Apply ticket presentation settings ------------------------------
  if (existingSettings === null) {
    const { error } = await db
      .from("graduation_event_ticket_settings")
      .insert(desiredSettings);
    if (error) {
      console.error("The ticket settings could not be created.");
      process.exitCode = 1;
      return;
    }
  } else {
    const { error } = await db
      .from("graduation_event_ticket_settings")
      .update(desiredSettings)
      .eq("event_id", event.id);
    if (error) {
      console.error("The ticket settings could not be updated.");
      process.exitCode = 1;
      return;
    }
  }

  console.log("Applied changes:");
  for (const line of changes) {
    console.log(line);
  }
  console.log("");
  console.log(
    "Registrations, tickets, check-ins and attendance were not modified."
  );
  console.log("Event configuration complete.");
}

main().catch(() => {
  console.error("Event configuration failed unexpectedly.");
  process.exitCode = 1;
});
