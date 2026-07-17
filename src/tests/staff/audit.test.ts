import { describe, expect, it } from "vitest";
import { assertSafeAuditValues } from "@/features/staff/audit";

describe("audit value safety", () => {
  it("accepts plain profile fields", () => {
    expect(() =>
      assertSafeAuditValues({
        role: "supervisor",
        is_active: true,
        display_name: "Fictional Staff",
        must_change_password: true,
      })
    ).not.toThrow();
  });

  it("rejects password-like keys at any depth", () => {
    expect(() =>
      assertSafeAuditValues({ password: "fictional-value" })
    ).toThrow();
    expect(() =>
      assertSafeAuditValues({ temporary_password: "fictional-value" })
    ).toThrow();
    expect(() =>
      assertSafeAuditValues({ nested: { access_token: "fictional-value" } })
    ).toThrow();
    expect(() =>
      assertSafeAuditValues([{ refresh_token: "fictional-value" }])
    ).toThrow();
    expect(() =>
      assertSafeAuditValues({ session_cookie: "fictional-value" })
    ).toThrow();
    expect(() =>
      assertSafeAuditValues({ client_secret: "fictional-value" })
    ).toThrow();
  });
});
