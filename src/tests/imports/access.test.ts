import { describe, expect, it } from "vitest";
import { isImportAccessEnabled } from "@/features/imports/access";
import {
  disabledResponse,
  internalErrorResponse,
} from "@/features/imports/http";
import { applyImportSchema } from "@/features/imports/schemas";

describe("import access controls", () => {
  it("is disabled in production even with the flag enabled", () => {
    expect(
      isImportAccessEnabled({
        appEnv: "production",
        enableDevImports: "true",
      })
    ).toBe(false);
  });

  it("is disabled in development when the flag is false or missing", () => {
    expect(
      isImportAccessEnabled({
        appEnv: "development",
        enableDevImports: "false",
      })
    ).toBe(false);
    expect(
      isImportAccessEnabled({
        appEnv: "development",
        enableDevImports: undefined,
      })
    ).toBe(false);
  });

  it("is enabled only in development with the explicit flag", () => {
    expect(
      isImportAccessEnabled({
        appEnv: "development",
        enableDevImports: "true",
      })
    ).toBe(true);
    expect(
      isImportAccessEnabled({ appEnv: "test", enableDevImports: "true" })
    ).toBe(false);
  });

  it("requires exact flag values", () => {
    expect(
      isImportAccessEnabled({
        appEnv: "development",
        enableDevImports: "TRUE",
      })
    ).toBe(false);
    expect(
      isImportAccessEnabled({ appEnv: "Development", enableDevImports: "true" })
    ).toBe(false);
  });
});

describe("structured API responses", () => {
  it("returns a not found style response when disabled", async () => {
    const response = disabledResponse();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body: unknown = await response.json();
    expect(body).toEqual({
      error: {
        code: "imports_disabled",
        message: "The import feature is not available.",
      },
    });
  });

  it("returns structured internal errors without stack traces or secrets", async () => {
    const response = internalErrorResponse();
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain("stack");
    expect(text).not.toContain("SUPABASE");
    expect(text).not.toContain("TICKET_TOKEN");
    expect(text).not.toContain("key");
  });
});

describe("apply confirmation schema", () => {
  it("requires the exact confirmation text and an idempotency key", () => {
    expect(
      applyImportSchema.safeParse({
        confirmation: "APPLY IMPORT",
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
      }).success
    ).toBe(true);
    expect(
      applyImportSchema.safeParse({
        confirmation: "apply import",
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
      }).success
    ).toBe(false);
    expect(
      applyImportSchema.safeParse({
        confirmation: "APPLY IMPORT",
        idempotencyKey: "not-a-uuid",
      }).success
    ).toBe(false);
  });
});
