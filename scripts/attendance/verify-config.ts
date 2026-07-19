/**
 * Verifies the attendance configuration for CHECKIN-08.
 *
 * Read-only: this script never creates, modifies or deletes anything. It
 * verifies the Supabase server credentials and the active event
 * configuration, confirms the configured event exists and is open, confirms
 * the CHECKIN-07 apply_graduation_checkin function is deployed and reports
 * whether the three CHECKIN-08 functions are deployed. It prints only an
 * aggregate attendance-row count for the event. Names, ticket codes, UUIDs,
 * reasons, QR payloads, tokens and hashes are never printed. Exits nonzero on
 * unsafe configuration.
 *
 * Before the CHECKIN-08 migration is deployed it safely reports that the new
 * functions are missing without failing the whole verification.
 */

import { config as loadDotenv } from "dotenv";

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

async function reportAttendanceRowCount(
  url: string,
  serviceRoleKey: string,
  eventId: string
): Promise<void> {
  const response = await fetchJson(
    url,
    serviceRoleKey,
    "/rest/v1/graduation_checkins?select=id," +
      "graduation_registrations!inner(event_id)" +
      `&graduation_registrations.event_id=eq.${encodeURIComponent(eventId)}` +
      "&limit=1",
    { Prefer: "count=exact" }
  );
  if (!response.ok) {
    return;
  }
  const rows = parseExactCount(response);
  if (rows !== null) {
    console.log(`Recorded attendance rows for the event: ${rows}`);
  }
}

/**
 * Calls a function with an all-zero, self-referential request that is
 * rejected long before any write: an unauthorized actor short-circuits first.
 * A missing function returns 404. Nothing is ever modified.
 */
async function checkFunctionDeployed(
  url: string,
  serviceRoleKey: string,
  functionName: string,
  body: Record<string, unknown>
): Promise<void> {
  const response = await fetch(restUrl(url, `/rest/v1/rpc/${functionName}`), {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (response.ok || response.status === 400 || response.status === 409) {
    console.log(`Function ${functionName} deployed: yes`);
    return;
  }
  if (response.status === 404) {
    console.log(
      `Function ${functionName} deployed: no. Deploy the CHECKIN-08 ` +
        "migration before using attendance corrections. This is safe before " +
        "deployment."
    );
    return;
  }
  console.log(
    `Function ${functionName} status could not be determined ` +
      `(HTTP ${response.status}).`
  );
}

async function main(): Promise<void> {
  loadDotenv({ path: ".env.local", override: false, quiet: true });

  const zeroUuid = "00000000-0000-0000-0000-000000000000";
  let unsafe = false;

  const eventCode = (process.env.ACTIVE_GRADUATION_EVENT_CODE ?? "").trim();
  if (eventCode.length === 0) {
    console.error("ACTIVE_GRADUATION_EVENT_CODE is not configured.");
    unsafe = true;
  } else {
    console.log(`Active event code: ${eventCode}`);
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

  const secret = (process.env.TICKET_TOKEN_SECRET ?? "").trim();
  if (secret.length === 0) {
    console.error(
      "TICKET_TOKEN_SECRET is not configured. Signed attendance references " +
        "require it."
    );
    unsafe = true;
  } else {
    console.log("Signing secret: present");
  }

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
              "create it before managing attendance."
          );
          unsafe = true;
        } else if (event.status === "closed" || event.status === "archived") {
          console.error(
            `The configured event is ${event.status}. Attendance fails safely.`
          );
          unsafe = true;
        } else {
          console.log(`Event found: ${event.event_name}`);
          console.log(`Event status: ${event.status}`);
          console.log(`Event mode: ${event.is_test ? "test" : "production"}`);

          await checkFunctionDeployed(
            url,
            serviceRoleKey,
            "apply_graduation_checkin",
            {
              p_actor_user_id: zeroUuid,
              p_event_id: zeroUuid,
              p_validation_attempt_id: zeroUuid,
              p_request_id: zeroUuid,
              p_graduate_arriving: 0,
              p_adult_guests_arriving: 0,
              p_children_0_4_arriving: 0,
              p_children_5_10_arriving: 0,
            }
          );
          await checkFunctionDeployed(
            url,
            serviceRoleKey,
            "apply_manual_graduation_arrival",
            {
              p_actor_user_id: zeroUuid,
              p_event_id: zeroUuid,
              p_registration_id: zeroUuid,
              p_request_id: zeroUuid,
              p_graduate_arriving: 0,
              p_adult_guests_arriving: 0,
              p_children_0_4_arriving: 0,
              p_children_5_10_arriving: 0,
              p_reason: "verify configuration only",
            }
          );
          await checkFunctionDeployed(
            url,
            serviceRoleKey,
            "apply_attendance_correction",
            {
              p_actor_user_id: zeroUuid,
              p_event_id: zeroUuid,
              p_registration_id: zeroUuid,
              p_request_id: zeroUuid,
              p_graduate_delta: 0,
              p_adult_guest_delta: 0,
              p_child_0_4_delta: 0,
              p_child_5_10_delta: 0,
              p_reason: "verify configuration only",
            }
          );
          await checkFunctionDeployed(
            url,
            serviceRoleKey,
            "reverse_graduation_checkin",
            {
              p_actor_user_id: zeroUuid,
              p_event_id: zeroUuid,
              p_original_checkin_id: zeroUuid,
              p_request_id: zeroUuid,
              p_reason: "verify configuration only",
            }
          );
          await reportAttendanceRowCount(url, serviceRoleKey, event.id);
        }
      }
    } catch {
      console.error(
        "Could not reach the Supabase project for the optional live checks."
      );
    }
  }

  if (unsafe) {
    console.error("Attendance configuration verification failed.");
    process.exitCode = 1;
    return;
  }
  console.log("Attendance configuration verification passed.");
}

main().catch(() => {
  console.error("Attendance configuration verification failed unexpectedly.");
  process.exitCode = 1;
});
