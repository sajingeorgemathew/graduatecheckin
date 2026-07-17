import { describe, expect, it } from "vitest";
import {
  loginDestination,
  loginRedirectPath,
  sanitizeNextPath,
} from "@/features/auth/redirects";

describe("safe next redirects", () => {
  it("accepts safe relative application paths", () => {
    expect(sanitizeNextPath("/admin/imports")).toBe("/admin/imports");
    expect(sanitizeNextPath("/admin/staff/new")).toBe("/admin/staff/new");
    expect(sanitizeNextPath("/staff?tab=tools")).toBe("/staff?tab=tools");
  });

  it("rejects external destinations", () => {
    expect(sanitizeNextPath("https://fictional-attacker.example")).toBe("/staff");
    expect(sanitizeNextPath("http://fictional-attacker.example/x")).toBe("/staff");
    expect(sanitizeNextPath("//fictional-attacker.example")).toBe("/staff");
    expect(sanitizeNextPath("/x/../https://fictional.example://y")).toBe("/staff");
  });

  it("rejects malformed and suspicious values", () => {
    expect(sanitizeNextPath(undefined)).toBe("/staff");
    expect(sanitizeNextPath(42)).toBe("/staff");
    expect(sanitizeNextPath("")).toBe("/staff");
    expect(sanitizeNextPath("admin")).toBe("/staff");
    expect(sanitizeNextPath("/path with space")).toBe("/staff");
    expect(sanitizeNextPath("/path\\backslash")).toBe("/staff");
    expect(sanitizeNextPath(`/x${"a".repeat(600)}`)).toBe("/staff");
  });

  it("never bounces back into the login page", () => {
    expect(sanitizeNextPath("/login")).toBe("/staff");
    expect(sanitizeNextPath("/login?next=/admin")).toBe("/staff");
  });

  it("sends a required password change to the change page first", () => {
    expect(loginDestination(true, "/admin/imports")).toBe(
      "/staff/change-password"
    );
    expect(loginDestination(false, "/admin/imports")).toBe("/admin/imports");
    expect(loginDestination(false, "https://fictional.example")).toBe("/staff");
  });

  it("builds login URLs with an encoded relative return path", () => {
    expect(loginRedirectPath("/admin/staff")).toBe(
      "/login?next=%2Fadmin%2Fstaff"
    );
    expect(loginRedirectPath("/staff")).toBe("/login");
    expect(loginRedirectPath("https://fictional.example")).toBe("/login");
  });
});
