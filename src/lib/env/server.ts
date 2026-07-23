import { z } from "zod";

/**
 * Server-side environment access. These variables must never be sent to the
 * browser and must never be printed in errors or logs.
 */

export interface ServerEnvInput {
  APP_ENV: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY: string | undefined;
  TICKET_TOKEN_SECRET: string | undefined;
  TICKET_DISTRIBUTION_SECRET: string | undefined;
  ACTIVE_GRADUATION_EVENT_CODE: string | undefined;
}

const serverEnvSchema = z.object({
  // CHECKIN-10A adds "preview" so a Vercel Preview deployment is a distinct,
  // non-production environment rather than being mistaken for production.
  APP_ENV: z
    .enum(["development", "test", "preview", "production"])
    .default("development"),
  // Secrets stay optional so the project builds before real credentials are
  // added. Modules that require them must check for presence at call time.
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
  TICKET_TOKEN_SECRET: z.string().default(""),
  // CHECKIN-09B row-signing secret for ticket-distribution delivery rows.
  // Server-only and deliberately separate from TICKET_TOKEN_SECRET so that a
  // leaked distribution secret can never forge a QR admission token.
  TICKET_DISTRIBUTION_SECRET: z.string().default(""),
  // The event code that imports and ticket operations target. Optional at
  // build time; event-dependent operations verify it at call time.
  ACTIVE_GRADUATION_EVENT_CODE: z.string().default(""),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(input: ServerEnvInput): ServerEnv {
  const result = serverEnvSchema.safeParse(input);
  if (!result.success) {
    // Report variable names only. Secret values must never appear in errors.
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(
      `Invalid server environment configuration for: ${names.join(", ")}`
    );
  }
  return result.data;
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv({
    APP_ENV: process.env.APP_ENV,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    TICKET_TOKEN_SECRET: process.env.TICKET_TOKEN_SECRET,
    TICKET_DISTRIBUTION_SECRET: process.env.TICKET_DISTRIBUTION_SECRET,
    ACTIVE_GRADUATION_EVENT_CODE: process.env.ACTIVE_GRADUATION_EVENT_CODE,
  });
}
