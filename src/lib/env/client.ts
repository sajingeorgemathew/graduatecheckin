import { z } from "zod";

/**
 * Client-safe environment access. This module may only read variables that
 * are prefixed with NEXT_PUBLIC_ and are safe to expose to the browser.
 */

export interface ClientEnvInput {
  NEXT_PUBLIC_APP_URL: string | undefined;
  NEXT_PUBLIC_SUPABASE_URL: string | undefined;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string | undefined;
}

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  // Supabase values stay optional so the project builds before real
  // credentials are added. Use isSupabasePublicConfigured to check readiness.
  NEXT_PUBLIC_SUPABASE_URL: z.string().default(""),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().default(""),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

export function parseClientEnv(input: ClientEnvInput): ClientEnv {
  const result = clientEnvSchema.safeParse(input);
  if (!result.success) {
    // Report variable names only. Values must never appear in error output.
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(
      `Invalid client environment configuration for: ${names.join(", ")}`
    );
  }
  return result.data;
}

export function isSupabasePublicConfigured(
  env: Pick<
    ClientEnv,
    "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  >
): boolean {
  return (
    env.NEXT_PUBLIC_SUPABASE_URL.trim().length > 0 &&
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim().length > 0
  );
}

export function getClientEnv(): ClientEnv {
  // NEXT_PUBLIC_ variables must be referenced literally so Next.js can
  // inline them into client bundles at build time.
  return parseClientEnv({
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
