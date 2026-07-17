import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getClientEnv, isSupabasePublicConfigured } from "@/lib/env/client";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Uses only public credentials plus the caller's session cookies.
 */
export async function createSupabaseServerClient() {
  const env = getClientEnv();
  if (!isSupabasePublicConfigured(env)) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local."
    );
  }
  const cookieStore = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components are not allowed to write cookies. Session
            // refresh happens in Route Handlers or middleware instead.
          }
        },
      },
    }
  );
}
