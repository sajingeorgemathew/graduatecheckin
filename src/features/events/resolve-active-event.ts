import "server-only";

/**
 * Server-side resolution of the configured active graduation event. Excel
 * imports and every ticket operation resolve the event through this module
 * so both features always target the same configured event. The event code
 * comes from the server environment only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, GraduationEventRow } from "@/types/database";
import { evaluateActiveEvent, type ActiveEventResolution } from "./active-event";

function db(): SupabaseClient<Database> {
  return getSupabaseAdminClient() as unknown as SupabaseClient<Database>;
}

/** The configured active event code, trimmed. Empty when not configured. */
export function getActiveEventCode(): string {
  return getServerEnv().ACTIVE_GRADUATION_EVENT_CODE.trim();
}

export async function resolveActiveEvent(): Promise<ActiveEventResolution> {
  const eventCode = getActiveEventCode();
  if (eventCode.length === 0) {
    return evaluateActiveEvent(eventCode, null);
  }

  const { data, error } = await db()
    .from("graduation_events")
    .select("*")
    .eq("event_code", eventCode)
    .maybeSingle();
  if (error) {
    // Database error details can echo row values and are never surfaced.
    throw new Error("Active event lookup failed.");
  }

  return evaluateActiveEvent(eventCode, data as GraduationEventRow | null);
}
