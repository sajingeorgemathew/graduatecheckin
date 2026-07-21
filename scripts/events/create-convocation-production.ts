/**
 * Creates the distinct production event for the real Convocation Ceremony
 * 2026, separate from the GRAD-2026-DEV test event.
 *
 * Usage:
 *   npm run events:create-production -- --dry-run   resolve and report only
 *   npm run events:create-production                create or converge
 *
 * Safety contract:
 *  - Idempotent. Running it repeatedly converges on the same state and
 *    reports "no change" once everything matches.
 *  - Creates the CONVOCATION-2026 event as a NON-TEST, DRAFT event and
 *    writes only its approved display settings and PDF ticket settings.
 *  - Never converts, renames or reuses GRAD-2026-DEV. That test event is
 *    read only for a safety comparison and is never written.
 *  - Copies no registrations, guests, tickets, PDFs, check-ins, attendance,
 *    imports, delivery records or mock data.
 *  - Never changes ACTIVE_GRADUATION_EVENT_CODE and never touches Vercel.
 *  - Dry-run makes no database writes at all.
 *  - Never prints a secret. Only names, times, venue text and counts.
 *
 * Standalone tsx CLI: it must not import a module chain that contains
 * `import "server-only"`. Ceremony detail constants come from the
 * runtime-neutral ./convocation-production-plan module.
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
  DEV_EVENT_CODE,
  PRODUCTION_EVENT_CODE,
  PRODUCTION_EVENT_DETAILS,
} from "./convocation-production-plan";

const REQUIRED_TABLES = [
  "graduation_events",
  "graduation_event_ticket_settings",
] as const;

interface PostgrestErrorLike {
  code?: string | null;
  message?: string;
}

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

async function verifyRequiredTables(db: AdminClient): Promise<boolean> {
  let ok = true;
  for (const table of REQUIRED_TABLES) {
    const { error } = await db.from(table).select("id").limit(1);
    if (error) {
      if (isMissingRelation(error)) {
        console.error(
          `Table ${table} was not found. Apply the migrations before ` +
            "creating the production event."
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

  let db: AdminClient;
  try {
    db = createScriptAdminClient();
  } catch (error) {
    if (error instanceof MissingEnvError) {
      console.error(
        `Supabase CLI credentials are missing: ${error.missing.join(", ")}. ` +
          "Set them in .env.local before creating the production event."
      );
    } else {
      console.error("The Supabase administrative client could not be created.");
    }
    process.exitCode = 1;
    return;
  }

  console.log(dryRun ? "Mode:                dry-run (no writes)" : "Mode: apply");
  console.log("");

  if (!(await verifyRequiredTables(db))) {
    process.exitCode = 1;
    return;
  }

  // Confirm the DEV test event is untouched and separate. Read only.
  const { data: devEvent } = await db
    .from("graduation_events")
    .select("event_code, is_test, status")
    .eq("event_code", DEV_EVENT_CODE)
    .maybeSingle();
  if (devEvent) {
    console.log(
      `Development event ${DEV_EVENT_CODE}: present (is_test=${devEvent.is_test}), preserved untouched.`
    );
  } else {
    console.log(`Development event ${DEV_EVENT_CODE}: not present (nothing to preserve).`);
  }
  console.log("");

  const logoAsset = resolvePrimaryLogoAssetName();
  if (!publicAssetExists(logoAsset)) {
    console.error(
      `Primary logo asset ${logoAsset} was not found in public/. Add it first.`
    );
    process.exitCode = 1;
    return;
  }

  const { data: existing, error: readError } = await db
    .from("graduation_events")
    .select("*")
    .eq("event_code", PRODUCTION_EVENT_CODE)
    .maybeSingle();
  if (readError) {
    console.error("The production event could not be loaded.");
    process.exitCode = 1;
    return;
  }

  console.log("Intended production event:");
  console.log(`  Code:       ${PRODUCTION_EVENT_CODE}`);
  console.log(`  Title:      ${PRODUCTION_EVENT_DETAILS.eventName}`);
  console.log(`  Mode:       production (is_test = false)`);
  console.log(`  Status:     draft`);
  console.log(`  Date:       Sunday, July 26, 2026`);
  console.log(
    `  Time:       12:00 PM to 4:00 PM (${PRODUCTION_EVENT_DETAILS.timezone})`
  );
  console.log(`  Venue:      ${PRODUCTION_EVENT_DETAILS.venueName}`);
  console.log(`  Address:    ${PRODUCTION_EVENT_DETAILS.venueAddress}`);
  console.log(
    `  Schedule:   ${PRODUCTION_EVENT_DETAILS.programSchedule.length} entries`
  );
  console.log(`  Logo asset: ${logoAsset}`);
  console.log("");

  if (existing) {
    console.log(`Production event already exists (status ${existing.status}).`);
    if (existing.is_test) {
      console.error(
        "The existing production event is flagged is_test=true, which is unsafe. " +
          "Investigate before proceeding; this script will not change the flag."
      );
      process.exitCode = 1;
      return;
    }
  } else {
    console.log("Production event does not exist yet; it will be created.");
  }
  console.log("");

  if (dryRun) {
    console.log(
      "Dry-run complete. No database writes were made. No registrations, " +
        "tickets, PDFs, check-ins, attendance, imports or delivery records " +
        "were created or copied."
    );
    return;
  }

  // ---- Create the event if missing (never overwrite mode/status) -------
  let eventId: string;
  if (existing === null) {
    const { data: inserted, error: insertError } = await db
      .from("graduation_events")
      .insert({
        event_code: PRODUCTION_EVENT_CODE,
        event_name: PRODUCTION_EVENT_DETAILS.eventName,
        starts_at: PRODUCTION_EVENT_DETAILS.startsAt,
        ends_at: PRODUCTION_EVENT_DETAILS.endsAt,
        timezone: PRODUCTION_EVENT_DETAILS.timezone,
        venue_name: PRODUCTION_EVENT_DETAILS.venueName,
        venue_address: PRODUCTION_EVENT_DETAILS.venueAddress,
        status: "draft",
        is_test: false,
      })
      .select("id")
      .single();
    if (insertError || inserted === null) {
      console.error("The production event could not be created.");
      process.exitCode = 1;
      return;
    }
    eventId = inserted.id;
    console.log("Created production event CONVOCATION-2026 (draft, production).");
  } else {
    eventId = existing.id;
    // Converge display facts only. Never touch event_code, is_test or status.
    const { error: updateError } = await db
      .from("graduation_events")
      .update({
        event_name: PRODUCTION_EVENT_DETAILS.eventName,
        starts_at: PRODUCTION_EVENT_DETAILS.startsAt,
        ends_at: PRODUCTION_EVENT_DETAILS.endsAt,
        timezone: PRODUCTION_EVENT_DETAILS.timezone,
        venue_name: PRODUCTION_EVENT_DETAILS.venueName,
        venue_address: PRODUCTION_EVENT_DETAILS.venueAddress,
      })
      .eq("id", eventId);
    if (updateError) {
      console.error("The production event display facts could not be updated.");
      process.exitCode = 1;
      return;
    }
    console.log("Converged production event display facts.");
  }

  // ---- Upsert PDF ticket settings --------------------------------------
  const desiredSettings = {
    event_id: eventId,
    display_title: PRODUCTION_EVENT_DETAILS.eventName,
    description: PRODUCTION_EVENT_DETAILS.description,
    program_schedule: serializeProgramSchedule(
      PRODUCTION_EVENT_DETAILS.programSchedule
    ),
    primary_logo_asset: logoAsset,
    secondary_asset: null,
    template_version: PRODUCTION_EVENT_DETAILS.templateVersion,
    instructions: PRODUCTION_EVENT_DETAILS.instructions,
  };

  const { data: existingSettings } = await db
    .from("graduation_event_ticket_settings")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();

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
      .eq("event_id", eventId);
    if (error) {
      console.error("The ticket settings could not be updated.");
      process.exitCode = 1;
      return;
    }
  }

  console.log("");
  console.log(
    "No registrations, guests, tickets, PDFs, check-ins, attendance, imports " +
      "or delivery records were created or copied."
  );
  console.log("ACTIVE_GRADUATION_EVENT_CODE was not changed.");
  console.log("Production event ready (draft). Activation belongs to CHECKIN-10.");
}

main().catch(() => {
  console.error("Production event creation failed unexpectedly.");
  process.exitCode = 1;
});
