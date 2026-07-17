import { createBrowserClient } from "@supabase/ssr";
import { getClientEnv, isSupabasePublicConfigured } from "@/lib/env/client";

/**
 * Supabase client for Client Components. Uses only public credentials.
 */
export function createSupabaseBrowserClient() {
  const env = getClientEnv();
  if (!isSupabasePublicConfigured(env)) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local."
    );
  }
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
