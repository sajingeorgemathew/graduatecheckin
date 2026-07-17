/**
 * Verifies whether an active administrator staff profile exists.
 *
 * Read-only: this script never creates, modifies or deletes anything. It
 * prints counts and masked emails only. Credentials, user IDs and full
 * email addresses are never printed. Exits nonzero when no active
 * administrator exists so automation can detect an incomplete bootstrap.
 *
 * The query uses a direct PostgREST GET request with the server-only
 * service-role key, so it runs on Node 20 without the realtime WebSocket
 * requirement of the full Supabase client.
 */

import { config as loadDotenv } from "dotenv";

interface AdministratorRow {
  email_snapshot: string | null;
  is_active: boolean;
  role: string;
}

/** Masks an email to its first character and domain first character. */
function maskEmail(email: string | null): string {
  const normalized = (email ?? "").trim().toLowerCase();
  const atIndex = normalized.indexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return "(no email recorded)";
  }
  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  return `${local[0]}***@${domain[0]}***`;
}

function isAdministratorRow(value: unknown): value is AdministratorRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "is_active" in value &&
    typeof (value as { is_active: unknown }).is_active === "boolean"
  );
}

async function main(): Promise<void> {
  // Loads .env.local without overriding existing process values. Values
  // are never printed.
  loadDotenv({ path: ".env.local", override: false, quiet: true });

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  const missing: string[] = [];
  if (url.length === 0) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (serviceRoleKey.length === 0) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Add them to .env.local before running this check."
    );
    process.exitCode = 1;
    return;
  }

  const endpoint =
    `${url.replace(/\/$/, "")}/rest/v1/staff_profiles` +
    "?select=email_snapshot,is_active,role&role=eq.administrator";

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
    });
  } catch {
    console.error(
      "Could not reach the Supabase project. Check the network connection " +
        "and NEXT_PUBLIC_SUPABASE_URL."
    );
    process.exitCode = 1;
    return;
  }

  if (!response.ok) {
    // Response bodies are not printed; they can echo schema details.
    if (response.status === 404) {
      console.error(
        "The staff_profiles table was not found. Apply the database " +
          "migrations first."
      );
    } else if (response.status === 400) {
      console.error(
        "The staff_profiles table is missing the CHECKIN-04 columns. " +
          "Apply the extend_staff_authentication migration first."
      );
    } else {
      console.error(
        `Failed to query administrator profiles (HTTP ${response.status}).`
      );
    }
    process.exitCode = 1;
    return;
  }

  const payload: unknown = await response.json();
  const administrators = Array.isArray(payload)
    ? payload.filter(isAdministratorRow)
    : [];
  const active = administrators.filter((row) => row.is_active);

  console.log(`Administrator profiles: ${administrators.length}`);
  console.log(`Active administrators: ${active.length}`);
  for (const row of active) {
    console.log(`  active administrator: ${maskEmail(row.email_snapshot)}`);
  }

  if (active.length === 0) {
    console.error(
      "No active administrator exists yet. Complete the one-time manual " +
        "bootstrap in the Supabase Dashboard (see README, Initial " +
        "administrator setup). This script never creates accounts."
    );
    process.exitCode = 1;
    return;
  }

  console.log("Administrator verification passed.");
}

main().catch(() => {
  console.error("Administrator verification failed unexpectedly.");
  process.exitCode = 1;
});
