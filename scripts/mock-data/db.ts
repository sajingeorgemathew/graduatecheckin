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

/**
 * Raised when a required CLI environment variable is absent. Callers can
 * detect this precisely (instanceof) so a genuinely missing variable is
 * never confused with an unrelated client-construction or network failure.
 */
export class MissingEnvError extends Error {
  readonly missing: readonly string[];
  constructor(missing: readonly string[]) {
    super(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Add them to .env.local before running database scripts."
    );
    this.name = "MissingEnvError";
    this.missing = missing;
  }
}

export function loadLocalEnv(): void {
  // Loads .env.local without overriding variables already present in the
  // process environment. Values must never be printed.
  loadDotenv({ path: ".env.local", override: false, quiet: true });
}

/**
 * A do-nothing WebSocket stand-in for the realtime transport.
 *
 * @supabase/supabase-js v2 constructs a RealtimeClient inside createClient,
 * which eagerly resolves a WebSocket constructor. On Node.js < 22 there is
 * no global WebSocket, so that resolution throws
 * "native WebSocket not found" even though these CLI scripts never open a
 * realtime channel. Supplying an explicit transport short-circuits the
 * lookup. It is only ever instantiated when a channel subscribes, which
 * these administrative scripts never do, so the stub is never used.
 */
class NoopRealtimeSocket {
  constructor() {
    throw new Error(
      "Realtime is disabled for CLI scripts and must not be used."
    );
  }
}

function assertScriptEnv(): { url: string; serviceRoleKey: string } {
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
    throw new MissingEnvError(missing);
  }
  return { url, serviceRoleKey };
}

export function createScriptAdminClient(): AdminClient {
  const { url, serviceRoleKey } = assertScriptEnv();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      // See NoopRealtimeSocket: keeps createClient from requiring a native
      // WebSocket on Node < 22. Never used by CLI scripts.
      transport: NoopRealtimeSocket as never,
    },
  });
}

/**
 * A public-role client using the anon/publishable key. Read-only in these
 * scripts: it exists so verification can prove that deny-by-default RLS
 * blocks the public role. It must never be used for administrative writes.
 * Returns null when the publishable key is not configured, so verification
 * can report that accurately instead of failing.
 */
export function createScriptAnonClient(): AdminClient | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
  ).trim();
  if (url.length === 0 || anonKey.length === 0) {
    return null;
  }
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: NoopRealtimeSocket as never,
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
