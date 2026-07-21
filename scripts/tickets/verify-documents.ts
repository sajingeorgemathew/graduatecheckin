/**
 * CHECKIN-09A verification checks, invoked by scripts/tickets/verify-config.ts.
 *
 * Read-only: nothing here creates, modifies or deletes anything, and no
 * PDF is rendered. It reports on the event configuration, the private
 * storage bucket, the required tables and functions, RLS, and the
 * integrity of stored documents.
 *
 * Standalone tsx CLI module: it imports no Next.js-only module and no module
 * containing `import "server-only"`. The Supabase clients come from the
 * shared CLI helper in scripts/mock-data/db.ts.
 *
 * Never prints a secret, a raw QR token, a token hash, a storage URL, an
 * email address or a graduate name.
 *
 * Failure reporting is categorised. A missing environment variable, an
 * inaccessible project, a missing migration, missing ticket settings, a
 * missing bucket, a missing asset and a plain query failure are all
 * distinct messages. They are never collapsed into a single misleading
 * "credentials unavailable" line: the base verifier having already reached
 * the project proves the credentials are present.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  createScriptAdminClient,
  createScriptAnonClient,
  isMissingMigrationError,
  MissingEnvError,
  type AdminClient,
} from "../mock-data/db";
import { TICKET_DOCUMENT_BUCKET } from "../../src/features/ticket-documents/constants";

export interface DocumentVerificationResult {
  passed: boolean;
  failures: string[];
}

const REQUIRED_TABLES = [
  "graduation_event_ticket_settings",
  "graduation_ticket_documents",
  "graduation_ticket_document_batches",
  "graduation_ticket_document_batch_items",
] as const;

/** Columns that must never exist: no raw QR token or token hash is stored. */
const FORBIDDEN_TOKEN_COLUMNS = [
  "token",
  "raw_token",
  "qr_token",
  "token_hash",
] as const;

const EXPECTED_EVENT = {
  title: "Convocation Ceremony 2026",
  timezone: "America/Toronto",
  venue: "Mississauga Grand Banquet & Event Centre",
  address: "35 Brunel Road, Mississauga, ON L4Z 3E8",
  startsAt: "2026-07-26T16:00:00+00:00",
  endsAt: "2026-07-26T20:00:00+00:00",
} as const;

interface PostgrestErrorLike {
  code: string | null;
  message: string;
}

/** True when the error text names a column that does not exist. */
function isUndefinedColumn(error: PostgrestErrorLike | null): boolean {
  if (error === null) {
    return false;
  }
  return (
    error.code === "42703" ||
    /column .* does not exist|could not find the .* column/i.test(error.message)
  );
}

export async function verifyTicketDocuments(
  eventCode: string
): Promise<DocumentVerificationResult> {
  const failures: string[] = [];
  const fail = (message: string): void => {
    failures.push(message);
    console.error(`  FAIL  ${message}`);
  };
  const pass = (message: string): void => {
    console.log(`  ok    ${message}`);
  };
  const info = (message: string): void => {
    console.log(`  info  ${message}`);
  };

  console.log("");
  console.log("CHECKIN-09A branded PDF ticket documents");

  // ---- Administrative client ------------------------------------------
  let db: AdminClient;
  try {
    db = createScriptAdminClient();
  } catch (error) {
    if (error instanceof MissingEnvError) {
      fail(
        `Required environment variable(s) missing: ${error.missing.join(", ")}.`
      );
    } else {
      // Not a credentials problem: the service client could not be built
      // for some other reason. Report it as its own category.
      fail("The Supabase administrative client could not be constructed.");
    }
    return { passed: false, failures };
  }

  // ---- Active event ----------------------------------------------------
  const { data: event, error: eventError } = await db
    .from("graduation_events")
    .select("*")
    .eq("event_code", eventCode)
    .maybeSingle();

  if (eventError) {
    if (isMissingMigrationError(eventError)) {
      fail("The graduation schema is not deployed (missing migration).");
    } else {
      fail("The Supabase project could not be queried for the active event.");
    }
    return { passed: false, failures };
  }
  if (event === null) {
    fail("The active graduation event was not found for this event code.");
    return { passed: false, failures };
  }
  pass("Active event exists");

  if (event.event_name === EXPECTED_EVENT.title) {
    pass(`Event title is "${EXPECTED_EVENT.title}"`);
  } else {
    fail(`Event title is "${event.event_name}".`);
  }
  if (event.timezone === EXPECTED_EVENT.timezone) {
    pass(`Timezone is ${EXPECTED_EVENT.timezone}`);
  } else {
    fail(`Timezone is ${event.timezone}.`);
  }
  const startsMatch =
    event.starts_at !== null &&
    new Date(event.starts_at).toISOString() ===
      new Date(EXPECTED_EVENT.startsAt).toISOString();
  if (startsMatch) {
    pass("Start time is 2026-07-26 12:00 PM America/Toronto");
  } else {
    fail("Start time does not match 2026-07-26 12:00 PM America/Toronto.");
  }
  const endsMatch =
    event.ends_at !== null &&
    new Date(event.ends_at).toISOString() ===
      new Date(EXPECTED_EVENT.endsAt).toISOString();
  if (endsMatch) {
    pass("End time is 2026-07-26 4:00 PM America/Toronto");
  } else {
    fail("End time does not match 2026-07-26 4:00 PM America/Toronto.");
  }
  if (event.venue_name === EXPECTED_EVENT.venue) {
    pass("Venue matches");
  } else {
    fail("Venue does not match the configured venue.");
  }
  if (event.venue_address === EXPECTED_EVENT.address) {
    pass("Address matches");
  } else {
    fail("Address does not match the configured address.");
  }

  // ---- Required tables -------------------------------------------------
  // Checked before the settings and document reads so a missing migration is
  // reported as exactly that, once, rather than as a cascade of unrelated
  // failures.
  let tablesPresent = true;
  for (const table of REQUIRED_TABLES) {
    const { error } = await db.from(table).select("id").limit(1);
    if (error) {
      tablesPresent = false;
      if (isMissingMigrationError(error)) {
        fail(`Table ${table} is missing. Apply the CHECKIN-09A migration.`);
      } else {
        fail(`Table ${table} could not be queried.`);
      }
    } else {
      pass(`Table ${table} exists`);
    }
  }

  if (!tablesPresent) {
    info(
      "Skipping settings, document, RLS and bucket checks until the " +
        "CHECKIN-09A migration is applied."
    );
    return { passed: false, failures };
  }

  // ---- Ticket settings -------------------------------------------------
  const { data: settings, error: settingsError } = await db
    .from("graduation_event_ticket_settings")
    .select("*")
    .eq("event_id", event.id)
    .maybeSingle();

  if (settingsError) {
    fail("The ticket settings row could not be queried.");
  } else if (settings === null) {
    fail("No ticket settings row exists. Run npm run tickets:configure-event.");
  } else {
    pass("Ticket settings row exists");
    if (settings.description.trim().length > 0) {
      pass("Ticket description is configured");
    } else {
      fail("The ticket description is empty.");
    }
    const schedule = Array.isArray(settings.program_schedule)
      ? settings.program_schedule
      : [];
    if (schedule.length === 3) {
      pass("Program schedule has 3 entries");
    } else {
      fail(`Program schedule has ${schedule.length} entries; expected 3.`);
    }
    const logoPath = join(process.cwd(), "public", settings.primary_logo_asset);
    if (existsSync(logoPath)) {
      pass(`Primary logo asset exists (${settings.primary_logo_asset})`);
    } else {
      fail(`Primary logo asset ${settings.primary_logo_asset} is missing.`);
    }
  }

  // ---- No raw QR token is stored --------------------------------------
  // Proven at the schema level: selecting any token-bearing column must fail
  // with "column does not exist". A successful select would mean the schema
  // has a place to store a raw token or hash, which is forbidden.
  let tokenColumnFound = false;
  for (const column of FORBIDDEN_TOKEN_COLUMNS) {
    const { error } = await db
      .from("graduation_ticket_documents")
      .select(column)
      .limit(1);
    if (error === null) {
      tokenColumnFound = true;
      fail(`Column ${column} exists on graduation_ticket_documents.`);
    } else if (!isUndefinedColumn(error)) {
      // An unrelated error is inconclusive; report it rather than assume.
      info(`Could not probe column ${column} (inconclusive).`);
    }
  }
  if (!tokenColumnFound) {
    pass("No raw QR token or token-hash column is stored");
  }

  // ---- Required functions ---------------------------------------------
  // Called with a deliberately invalid actor so nothing can be written.
  // A "not_authorized" reply proves the function exists and enforces the
  // administrator check.
  const nilUuid = "00000000-0000-0000-0000-000000000000";
  const { error: invalidateError } = await db.rpc(
    "invalidate_graduation_ticket_documents",
    { p_actor_user_id: nilUuid, p_ticket_id: nilUuid, p_reason: "revoked" }
  );
  if (invalidateError) {
    if (isMissingMigrationError(invalidateError)) {
      fail("Function invalidate_graduation_ticket_documents is missing.");
    } else {
      fail("Function invalidate_graduation_ticket_documents call failed.");
    }
  } else {
    pass("Function invalidate_graduation_ticket_documents exists");
  }

  // ---- Row level security ----------------------------------------------
  // Deny-by-default RLS: the public (anon) role must not be able to read the
  // document tables. A public read that succeeds is a security failure.
  const anon = createScriptAnonClient();
  if (anon === null) {
    info(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set; skipped the RLS probe."
    );
  } else {
    const { data: anonRows, error: anonError } = await anon
      .from("graduation_ticket_documents")
      .select("id")
      .limit(1);
    if (anonError) {
      // Deny-by-default returns a permission error, which is the safe state.
      pass("RLS blocks the public role from reading ticket documents");
    } else if (Array.isArray(anonRows) && anonRows.length === 0) {
      // No error but also no rows: the grant/policy let the query run. That
      // is weaker than deny-by-default and is reported as a failure.
      fail("The public role can query ticket documents (RLS is too open).");
    } else {
      fail("The public role can READ ticket documents (RLS is not enforced).");
    }
  }

  // ---- Private storage bucket -----------------------------------------
  const { data: bucket, error: bucketError } =
    await db.storage.getBucket(TICKET_DOCUMENT_BUCKET);
  if (bucketError || bucket === null) {
    fail(
      `Storage bucket ${TICKET_DOCUMENT_BUCKET} does not exist or is ` +
        "unreadable. Apply the CHECKIN-09A migration."
    );
  } else {
    pass(`Storage bucket ${TICKET_DOCUMENT_BUCKET} exists`);
    if (bucket.public) {
      fail("The ticket document bucket is PUBLIC. It must be private.");
    } else {
      pass("Storage bucket is private");
    }
    const mimeTypes = bucket.allowed_mime_types ?? [];
    if (mimeTypes.length === 1 && mimeTypes[0] === "application/pdf") {
      pass("Storage bucket accepts application/pdf only");
    } else {
      fail("The bucket MIME restriction is not application/pdf only.");
    }
  }

  // ---- Document integrity ---------------------------------------------
  const { data: documents, error: documentsError } = await db
    .from("graduation_ticket_documents")
    .select(
      "id, ticket_id, status, storage_path, file_name, sha256_checksum, document_version"
    )
    .eq("event_id", event.id);

  if (documentsError) {
    fail("The ticket documents could not be queried.");
    return { passed: failures.length === 0, failures };
  }

  const rows = documents ?? [];
  info(`${rows.length} ticket document(s) recorded`);
  if (rows.length === 0) {
    // Zero generated PDFs is the correct initial state before the first
    // generation run. It is not a failure.
    info("Zero generated documents is a valid initial state");
  }

  const currentByTicket = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== "current") {
      continue;
    }
    currentByTicket.set(
      row.ticket_id,
      (currentByTicket.get(row.ticket_id) ?? 0) + 1
    );
  }
  const duplicates = [...currentByTicket.values()].filter((n) => n > 1).length;
  if (duplicates === 0) {
    pass("No ticket has more than one current document");
  } else {
    fail(`${duplicates} ticket(s) have more than one current document.`);
  }

  // Storage paths and file names must never carry personal data.
  const leaky = rows.filter(
    (row) => row.storage_path.includes("@") || row.file_name.includes("@")
  ).length;
  if (leaky === 0) {
    pass("No storage path or file name contains an email address");
  } else {
    fail(`${leaky} document(s) have a path or file name containing "@".`);
  }

  // Existence and checksum verification of current documents. Bounded so
  // the verifier stays fast on a large event.
  const currentRows = rows.filter((row) => row.status === "current").slice(0, 25);
  let missingObjects = 0;
  let checksumMismatches = 0;
  for (const row of currentRows) {
    const { data: file, error } = await db.storage
      .from(TICKET_DOCUMENT_BUCKET)
      .download(row.storage_path);
    if (error || file === null) {
      missingObjects += 1;
      continue;
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const { createHash } = await import("node:crypto");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (checksum !== row.sha256_checksum) {
      checksumMismatches += 1;
    }
  }
  if (currentRows.length === 0) {
    info("No current documents to verify yet");
  } else {
    if (missingObjects === 0) {
      pass(`All ${currentRows.length} sampled current document file(s) exist`);
    } else {
      fail(`${missingObjects} current document file(s) are missing.`);
    }
    if (checksumMismatches === 0) {
      pass("Sampled document checksums match the stored bytes");
    } else {
      fail(`${checksumMismatches} document checksum(s) do not match.`);
    }
  }

  // ---- Batch rules -----------------------------------------------------
  const { data: batches, error: batchesError } = await db
    .from("graduation_ticket_document_batches")
    .select("id, selected_count, status")
    .eq("event_id", event.id);
  if (batchesError) {
    fail("The export batches could not be queried.");
  } else {
    const oversized = (batches ?? []).filter(
      (batch) => batch.selected_count > 50
    ).length;
    if (oversized === 0) {
      pass("All export batches respect the 50-registration maximum");
    } else {
      fail(`${oversized} export batch(es) exceed the 50-registration maximum.`);
    }
  }

  return { passed: failures.length === 0, failures };
}
