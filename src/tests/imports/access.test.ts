import { describe, expect, it } from "vitest";
import { hasImportAccess } from "@/features/imports/access";
import {
  forbiddenResponse,
  internalErrorResponse,
} from "@/features/imports/http";
import { applyImportSchema } from "@/features/imports/schemas";
import { fictionalSession } from "../auth/helpers";

describe("import access controls", () => {
  it("denies anonymous callers", () => {
    expect(hasImportAccess(null)).toBe(false);
  });

  it("denies scanners and supervisors", () => {
    expect(hasImportAccess(fictionalSession("scanner"))).toBe(false);
    expect(hasImportAccess(fictionalSession("supervisor"))).toBe(false);
  });

  it("allows active administrators", () => {
    expect(hasImportAccess(fictionalSession("administrator"))).toBe(true);
  });

  it("denies inactive administrators", () => {
    expect(
      hasImportAccess(fictionalSession("administrator", { isActive: false }))
    ).toBe(false);
  });

  it("denies administrators with a pending required password change", () => {
    expect(
      hasImportAccess(
        fictionalSession("administrator", { mustChangePassword: true })
      )
    ).toBe(false);
  });

  it("requires no development environment flag", () => {
    // Access is decided purely from the trusted session; ENABLE_DEV_IMPORTS
    // no longer exists anywhere in the environment schema.
    expect(process.env.ENABLE_DEV_IMPORTS).toBeUndefined();
    expect(hasImportAccess(fictionalSession("administrator"))).toBe(true);
  });
});

describe("structured API responses", () => {
  it("returns a 403 with no-store caching when access is denied", async () => {
    const response = forbiddenResponse();
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body: unknown = await response.json();
    expect(body).toEqual({
      error: {
        code: "not_authorized",
        message: "Administrator access is required for imports.",
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
