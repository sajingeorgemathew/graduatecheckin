import { describe, expect, it } from "vitest";
import { isSupabasePublicConfigured, parseClientEnv } from "@/lib/env/client";
import { parseServerEnv } from "@/lib/env/server";

describe("client environment", () => {
  it("detects missing public Supabase credentials", () => {
    const env = parseClientEnv({
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
    });
    expect(isSupabasePublicConfigured(env)).toBe(false);
  });

  it("detects configured public Supabase credentials", () => {
    const env = parseClientEnv({
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "https://fictional-project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fictional_key",
    });
    expect(isSupabasePublicConfigured(env)).toBe(true);
  });

  it("reports invalid variables by name without exposing values", () => {
    const fictionalValue = "not-a-url-fictional-value";
    let message = "";
    try {
      parseClientEnv({
        NEXT_PUBLIC_APP_URL: fictionalValue,
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("NEXT_PUBLIC_APP_URL");
    expect(message).not.toContain(fictionalValue);
  });
});

describe("server environment", () => {
  it("applies safe defaults when optional values are missing", () => {
    const env = parseServerEnv({
      APP_ENV: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      TICKET_TOKEN_SECRET: undefined,
      TICKET_DISTRIBUTION_SECRET: undefined,
      ACTIVE_GRADUATION_EVENT_CODE: undefined,
    });
    expect(env.APP_ENV).toBe("development");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("");
    expect(env.TICKET_TOKEN_SECRET).toBe("");
    expect(env.TICKET_DISTRIBUTION_SECRET).toBe("");
    expect(env.ACTIVE_GRADUATION_EVENT_CODE).toBe("");
  });

  it("accepts fictional secrets without altering them", () => {
    const env = parseServerEnv({
      APP_ENV: "test",
      SUPABASE_SERVICE_ROLE_KEY: "fictional-service-role-key",
      TICKET_TOKEN_SECRET: "fictional-ticket-token-secret",
      TICKET_DISTRIBUTION_SECRET: "fictional-distribution-secret",
      ACTIVE_GRADUATION_EVENT_CODE: "GRAD-2026-DEV",
    });
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("fictional-service-role-key");
    expect(env.TICKET_TOKEN_SECRET).toBe("fictional-ticket-token-secret");
  });

  it("does not expose secret values in validation errors", () => {
    const fictionalSecretValue = "fictional-secret-that-must-stay-hidden";
    let message = "";
    try {
      parseServerEnv({
        APP_ENV: fictionalSecretValue,
        SUPABASE_SERVICE_ROLE_KEY: "fictional-service-role-key",
        TICKET_TOKEN_SECRET: "fictional-ticket-token-secret",
        TICKET_DISTRIBUTION_SECRET: "fictional-distribution-secret",
        ACTIVE_GRADUATION_EVENT_CODE: "GRAD-2026-DEV",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("APP_ENV");
    expect(message).not.toContain(fictionalSecretValue);
    expect(message).not.toContain("fictional-service-role-key");
    expect(message).not.toContain("fictional-ticket-token-secret");
  });
});
