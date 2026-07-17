import { NextResponse } from "next/server";
import { buildHealthPayload } from "@/lib/health";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(
    buildHealthPayload({
      appEnv: process.env.APP_ENV,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    }),
    { status: 200 }
  );
}
