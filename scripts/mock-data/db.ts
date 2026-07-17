/**
 * Shared database access for mock-data scripts.
 *
 * These scripts run under tsx outside the Next.js runtime, so they build a
 * service-role admin client directly with the same server-only settings as
 * src/lib/supabase/admin.ts. Credentials are read from the environment and
 * are never logged or echoed.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";

import type { Database } from "../../src/types/database";
import type { EventLookupClient, TargetEventRecord } from "./reset-guards";

export type AdminClient = SupabaseClient<Database>;

export function loadLocalEnv(): void {
  // Loads .env.local without overriding variables already present in the
  // process environment. Values must never be printed.
  loadDotenv({ path: ".env.local", override: false, quiet: true });
}

export function createScriptAdminClient(): AdminClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const missing: string[] = [];
  if (url.trim().length === 0) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (serviceRoleKey.trim().length === 0) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Add them to .env.local before running database scripts."
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

interface PostgrestErrorLike {
  code: string | null;
  message: string;
}

/**
 * True when the error indicates the schema migration has not been applied,
 * for example a missing table reported by Postgres or the PostgREST cache.
 */
export function isMissingMigrationError(error: PostgrestErrorLike): boolean {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return true;
  }
  return /schema cache|does not exist/i.test(error.message);
}

export const MISSING_MIGRATION_MESSAGE =
  "The graduation check-in tables were not found. Apply the database migration first " +
  "(local stack: npm run supabase:reset).";

export function createEventLookup(client: AdminClient): EventLookupClient {
  return {
    async fetchEventByCode(
      eventCode: string
    ): Promise<TargetEventRecord | null> {
      const { data, error } = await client
        .from("graduation_events")
        .select("id, event_code, is_test")
        .eq("event_code", eventCode)
        .maybeSingle();

      if (error) {
        if (isMissingMigrationError(error)) {
          throw new Error(MISSING_MIGRATION_MESSAGE);
        }
        throw new Error(
          `Failed to look up the development event: ${error.message}`
        );
      }
      return data;
    },
  };
}
