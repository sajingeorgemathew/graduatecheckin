export interface HealthCheckInput {
  appEnv: string | undefined;
  supabaseUrl: string | undefined;
  supabasePublishableKey: string | undefined;
}

export interface HealthPayload {
  status: "ok";
  application: "graduation-checkin";
  environment: string;
  supabaseConfigured: boolean;
}

/**
 * Builds the health endpoint response. The payload reports presence of the
 * public Supabase configuration only and never includes variable values.
 */
export function buildHealthPayload(input: HealthCheckInput): HealthPayload {
  const supabaseConfigured =
    (input.supabaseUrl ?? "").trim().length > 0 &&
    (input.supabasePublishableKey ?? "").trim().length > 0;

  const environment =
    input.appEnv && input.appEnv.trim().length > 0
      ? input.appEnv
      : "development";

  return {
    status: "ok",
    application: "graduation-checkin",
    environment,
    supabaseConfigured,
  };
}
