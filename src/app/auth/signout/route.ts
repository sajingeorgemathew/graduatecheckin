import { NextResponse } from "next/server";
import { LOGIN_PATH } from "@/features/auth/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Secure sign out. Only POST is accepted because signing out changes
 * state. Supabase clears its session cookies through the server client
 * cookie adapter and the browser is sent back to the login page.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL(LOGIN_PATH, request.url), 303);
}
