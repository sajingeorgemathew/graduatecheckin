import { describe, expect, it } from "vitest";
import { buildHealthPayload } from "@/lib/health";

const FICTIONAL_SECRET = "fictional-service-role-key-for-tests";

describe("buildHealthPayload", () => {
  it("reports the application name", () => {
    const payload = buildHealthPayload({
      appEnv: "development",
      supabaseUrl: undefined,
      supabasePublishableKey: undefined,
    });
    expect(payload.application).toBe("graduation-checkin");
  });

  it("reports the environment value", () => {
    const payload = buildHealthPayload({
      appEnv: "test",
      supabaseUrl: undefined,
      supabasePublishableKey: undefined,
    });
    expect(payload.environment).toBe("test");
  });

  it("falls back to development when the environment is unset", () => {
    const payload = buildHealthPayload({
      appEnv: undefined,
      supabaseUrl: undefined,
      supabasePublishableKey: undefined,
    });
    expect(payload.environment).toBe("development");
  });

  it("reports supabaseConfigured false when public credentials are missing", () => {
    const payload = buildHealthPayload({
      appEnv: "development",
      supabaseUrl: "",
      supabasePublishableKey: "",
    });
    expect(payload.supabaseConfigured).toBe(false);
  });

  it("reports supabaseConfigured false when only one credential is present", () => {
    const payload = buildHealthPayload({
      appEnv: "development",
      supabaseUrl: "https://fictional-project.supabase.co",
      supabasePublishableKey: "",
    });
    expect(payload.supabaseConfigured).toBe(false);
  });

  it("reports supabaseConfigured true when public credentials are present", () => {
    const payload = buildHealthPayload({
      appEnv: "development",
      supabaseUrl: "https://fictional-project.supabase.co",
      supabasePublishableKey: "sb_publishable_fictional_key",
    });
    expect(payload.supabaseConfigured).toBe(true);
  });

  it("never returns credential values in the payload", () => {
    const payload = buildHealthPayload({
      appEnv: "development",
      supabaseUrl: "https://fictional-project.supabase.co",
      supabasePublishableKey: FICTIONAL_SECRET,
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(FICTIONAL_SECRET);
    expect(serialized).not.toContain("fictional-project.supabase.co");
    expect(Object.keys(payload).sort()).toEqual([
      "application",
      "environment",
      "status",
      "supabaseConfigured",
    ]);
  });
});
