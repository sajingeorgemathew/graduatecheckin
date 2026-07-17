import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env/server";

/**
 * Privileged Supabase client using the service-role key. Server-only.
 * Never import this module from a Client Component and never re-export it
 * through a client-accessible barrel file.
 */

let adminClient: SupabaseClient | null = null;

// The client is created lazily so builds succeed before credentials exist
// and no privileged client is constructed unless server code requests one.
export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClient) {
    return adminClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  if (url.trim().length === 0 || SUPABASE_SERVICE_ROLE_KEY.trim().length === 0) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set."
    );
  }

  adminClient = createClient(url, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return adminClient;
}
