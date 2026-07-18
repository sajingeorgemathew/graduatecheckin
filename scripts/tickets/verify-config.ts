/**
 * Verifies the ticket-generation configuration.
 *
 * Read-only: this script never creates, modifies or deletes anything. It
 * prints the active event code, whether the ticket secret is configured
 * and valid, a short one-way SHA-256 fingerprint of the secret for
 * administrative comparison and registration eligibility counts only.
 * The secret value, raw tokens, names, emails and phone numbers are
 * never printed. Exits nonzero on unsafe configuration.
 */

import { config as loadDotenv } from "dotenv";
import {
  MIN_SECRET_ENTROPY_BYTES,
  ticketSecretFingerprint,
  validateTicketSecret,
} from "../../src/features/tickets/token";

interface EventRow {
  id: string;
  event_name: string;
  status: string;
  is_test: boolean;
}

function isEventRow(value: unknown): value is EventRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string" &&
    "status" in value &&
    typeof (value as { status: unknown }).status === "string"
  );
}

async function fetchJson(
  url: string,
  serviceRoleKey: string,
  path: string,
  extraHeaders: Record<string, string> = {}
): Promise<Response> {
  return fetch(`${url.replace(/\/$/, "")}${path}`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
      ...extraHeaders,
    },
  });
}

async function countRegistrations(
  url: string,
  serviceRoleKey: string,
  eventId: string,
  statusFilter: string
): Promise<number | null> {
  const response = await fetchJson(
    url,
    serviceRoleKey,
    "/rest/v1/graduation_registrations?select=id&event_id=eq." +
      encodeURIComponent(eventId) +
      statusFilter +
      "&limit=1",
    { Prefer: "count=exact" }
  );
  if (!response.ok) {
    return null;
  }
  const contentRange = response.headers.get("content-range") ?? "";
  const total = contentRange.split("/")[1];
  const parsed = Number.parseInt(total ?? "", 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function main(): Promise<void> {
  // Loads .env.local without overriding existing process values. Values
  // are never printed.
  loadDotenv({ path: ".env.local", override: false, quiet: true });

  let unsafe = false;

  const eventCode = (process.env.ACTIVE_GRADUATION_EVENT_CODE ?? "").trim();
  if (eventCode.length === 0) {
    console.error("ACTIVE_GRADUATION_EVENT_CODE is not configured.");
    unsafe = true;
  } else {
    console.log(`Active event code: ${eventCode}`);
  }

  const secret = process.env.TICKET_TOKEN_SECRET;
  const secretCheck = validateTicketSecret(secret);
  console.log(`Ticket secret configured: ${secretCheck.configured ? "yes" : "no"}`);
  if (!secretCheck.configured) {
    console.error("TICKET_TOKEN_SECRET is not configured.");
    unsafe = true;
  } else if (!secretCheck.valid) {
    console.error(
      `TICKET_TOKEN_SECRET provides ${secretCheck.entropyBytes} bytes of ` +
        `entropy; at least ${MIN_SECRET_ENTROPY_BYTES} bytes are required.`
    );
    unsafe = true;
  } else {
    console.log(
      `Ticket secret length valid: yes (${secretCheck.entropyBytes} bytes)`
    );
    console.log(
      `Ticket secret fingerprint (SHA-256, one-way): ${ticketSecretFingerprint(secret ?? "")}`
    );
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (url.length === 0 || serviceRoleKey.length === 0) {
    console.error(
      "Supabase server credentials are missing. Set " +
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local."
    );
    unsafe = true;
  } else {
    console.log("Supabase server credentials: present");
  }

  // Optional live check: confirms the configured event exists and prints
  // eligibility counts only. Never modifies anything.
  if (!unsafe && url.length > 0 && serviceRoleKey.length > 0) {
    try {
      const response = await fetchJson(
        url,
        serviceRoleKey,
        "/rest/v1/graduation_events?select=id,event_name,status,is_test" +
          `&event_code=eq.${encodeURIComponent(eventCode)}`
      );
      if (!response.ok) {
        console.error(
          `Could not query the configured event (HTTP ${response.status}). ` +
            "The CHECKIN-05 migration may not be deployed yet."
        );
      } else {
        const payload: unknown = await response.json();
        const event = Array.isArray(payload) ? payload.find(isEventRow) : undefined;
        if (event === undefined) {
          console.error(
            "The configured event was not found in the database. Seed or " +
              "create it before generating tickets."
          );
          unsafe = true;
        } else if (event.status === "closed" || event.status === "archived") {
          console.error(`The configured event is ${event.status}.`);
          unsafe = true;
        } else {
          console.log(`Event found: ${event.event_name}`);
          console.log(`Event status: ${event.status}`);
          console.log(`Event mode: ${event.is_test ? "test" : "production"}`);

          const eligible = await countRegistrations(
            url,
            serviceRoleKey,
            event.id,
            "&registration_status=eq.eligible"
          );
          const total = await countRegistrations(url, serviceRoleKey, event.id, "");
          if (eligible !== null && total !== null) {
            console.log(`Registrations: ${total}`);
            console.log(`Eligible registrations: ${eligible}`);
          }
        }
      }
    } catch {
      console.error(
        "Could not reach the Supabase project for the optional event check."
      );
    }
  }

  if (unsafe) {
    console.error("Ticket configuration verification failed.");
    process.exitCode = 1;
    return;
  }
  console.log("Ticket configuration verification passed.");
}

main().catch(() => {
  console.error("Ticket configuration verification failed unexpectedly.");
  process.exitCode = 1;
});
