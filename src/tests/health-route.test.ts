import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

const FICTIONAL_KEY = "sb_publishable_fictional_key";

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns HTTP 200 with a JSON content type", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("reports the application name and environment", async () => {
    vi.stubEnv("APP_ENV", "test");
    const body = await GET().json();
    expect(body.status).toBe("ok");
    expect(body.application).toBe("graduation-checkin");
    expect(body.environment).toBe("test");
  });

  it("detects missing public Supabase credentials", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const body = await GET().json();
    expect(body.supabaseConfigured).toBe(false);
  });

  it("detects configured public Supabase credentials", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://fictional-project.supabase.co"
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", FICTIONAL_KEY);
    const body = await GET().json();
    expect(body.supabaseConfigured).toBe(true);
  });

  it("does not return secret or credential values", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://fictional-project.supabase.co"
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", FICTIONAL_KEY);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fictional-service-role-key");
    vi.stubEnv("TICKET_TOKEN_SECRET", "fictional-ticket-token-secret");
    const response = GET();
    const text = await response.text();
    expect(text).not.toContain(FICTIONAL_KEY);
    expect(text).not.toContain("fictional-project.supabase.co");
    expect(text).not.toContain("fictional-service-role-key");
    expect(text).not.toContain("fictional-ticket-token-secret");
  });
});
