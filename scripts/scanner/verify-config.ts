/**
 * Verifies the scanner configuration for CHECKIN-06.
 *
 * Read-only: this script never creates, modifies or deletes anything. It
 * verifies the active event configuration, the ticket-secret
 * configuration and the Supabase server credentials, confirms the
 * configured event exists, checks whether the ticket_scan_attempts table
 * has been deployed and prints ticket status counts only. Names, ticket
 * codes, UUIDs, tokens, hashes and contact information are never
 * printed. Exits nonzero on unsafe configuration.
 *
 * Before the CHECKIN-06 migration is deployed it safely reports that the
 * scan-attempt table is missing without failing the verification.
 */

import { config as loadDotenv } from "dotenv";
import {
  MIN_SECRET_ENTROPY_BYTES,
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

function restUrl(url: string, path: string): string {
  return `${url.replace(/\/$/, "")}${path}`;
}

async function fetchJson(
  url: string,
  serviceRoleKey: string,
  path: string,
  extraHeaders: Record<string, string> = {}
): Promise<Response> {
  return fetch(restUrl(url, path), {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
      ...extraHeaders,
    },
  });
}

function parseExactCount(response: Response): number | null {
  const contentRange = response.headers.get("content-range") ?? "";
  const total = contentRange.split("/")[1];
  const parsed = Number.parseInt(total ?? "", 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Counts event tickets in one status through the registration join. */
async function countEventTickets(
  url: string,
  serviceRoleKey: string,
  eventId: string,
  status: string
): Promise<number | null> {
  const response = await fetchJson(
    url,
    serviceRoleKey,
    "/rest/v1/graduation_tickets?select=id,graduation_registrations!inner(event_id)" +
      `&graduation_registrations.event_id=eq.${encodeURIComponent(eventId)}` +
      `&status=eq.${encodeURIComponent(status)}` +
      "&limit=1",
    { Prefer: "count=exact" }
  );
  if (!response.ok) {
    return null;
  }
  return parseExactCount(response);
}

async function checkScanAttemptTable(
  url: string,
  serviceRoleKey: string
): Promise<void> {
  const response = await fetchJson(
    url,
    serviceRoleKey,
    "/rest/v1/ticket_scan_attempts?select=id&limit=1",
    { Prefer: "count=exact" }
  );
  if (response.ok) {
    const count = parseExactCount(response);
    console.log("Scan-attempt table deployed: yes");
    if (count !== null) {
      console.log(`Recorded scan attempts: ${count}`);
    }
    return;
  }
  console.log(
    "Scan-attempt table deployed: no. Deploy the CHECKIN-06 migration " +
      "before using the scanner. This is safe before deployment."
  );
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

  const secretCheck = validateTicketSecret(process.env.TICKET_TOKEN_SECRET);
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
    console.log("Ticket secret configured: yes");
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

  // Optional live checks: confirm the configured event exists, report
  // whether the scan-attempt table is deployed and print ticket status
  // counts only. Never modifies anything.
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
          `Could not query the configured event (HTTP ${response.status}).`
        );
        unsafe = true;
      } else {
        const payload: unknown = await response.json();
        const event = Array.isArray(payload)
          ? payload.find(isEventRow)
          : undefined;
        if (event === undefined) {
          console.error(
            "The configured event was not found in the database. Seed or " +
              "create it before scanning tickets."
          );
          unsafe = true;
        } else if (event.status === "closed" || event.status === "archived") {
          console.error(
            `The configured event is ${event.status}. Scanning fails safely.`
          );
          unsafe = true;
        } else {
          console.log(`Event found: ${event.event_name}`);
          console.log(`Event status: ${event.status}`);
          console.log(`Event mode: ${event.is_test ? "test" : "production"}`);

          for (const status of [
            "active",
            "pending",
            "revoked",
            "replaced",
          ]) {
            const count = await countEventTickets(
              url,
              serviceRoleKey,
              event.id,
              status
            );
            if (count !== null) {
              console.log(`Tickets ${status}: ${count}`);
            }
          }
        }

        await checkScanAttemptTable(url, serviceRoleKey);
      }
    } catch {
      console.error(
        "Could not reach the Supabase project for the optional live checks."
      );
    }
  }

  if (unsafe) {
    console.error("Scanner configuration verification failed.");
    process.exitCode = 1;
    return;
  }
  console.log("Scanner configuration verification passed.");
}

main().catch(() => {
  console.error("Scanner configuration verification failed unexpectedly.");
  process.exitCode = 1;
});
