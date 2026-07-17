import { describe, expect, it } from "vitest";
import {
  isPasswordCompliant,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validatePassword,
} from "@/features/auth/password-policy";
import { changePasswordSchema } from "@/features/auth/schemas";

const COMPLIANT = "Fictional-Pass-123!";

describe("password policy", () => {
  it("accepts a compliant password", () => {
    expect(validatePassword(COMPLIANT)).toEqual([]);
    expect(isPasswordCompliant(COMPLIANT)).toBe(true);
  });

  it("requires the minimum length", () => {
    const short = "Ab1!x".padEnd(PASSWORD_MIN_LENGTH - 1, "a");
    expect(
      validatePassword(short).some((issue) => issue.code === "too_short")
    ).toBe(true);
  });

  it("rejects passwords above the maximum length", () => {
    const long = `Aa1!${"a".repeat(PASSWORD_MAX_LENGTH)}`;
    expect(
      validatePassword(long).some((issue) => issue.code === "too_long")
    ).toBe(true);
  });

  it("requires an uppercase letter", () => {
    expect(
      validatePassword("fictional-pass-123!").some(
        (issue) => issue.code === "missing_uppercase"
      )
    ).toBe(true);
  });

  it("requires a lowercase letter", () => {
    expect(
      validatePassword("FICTIONAL-PASS-123!").some(
        (issue) => issue.code === "missing_lowercase"
      )
    ).toBe(true);
  });

  it("requires a number", () => {
    expect(
      validatePassword("Fictional-Pass-!!!").some(
        (issue) => issue.code === "missing_number"
      )
    ).toBe(true);
  });

  it("requires a symbol", () => {
    expect(
      validatePassword("FictionalPass1234").some(
        (issue) => issue.code === "missing_symbol"
      )
    ).toBe(true);
  });

  it("rejects leading or trailing whitespace", () => {
    expect(
      validatePassword(` ${COMPLIANT}`).some(
        (issue) => issue.code === "surrounding_whitespace"
      )
    ).toBe(true);
    expect(
      validatePassword(`${COMPLIANT} `).some(
        (issue) => issue.code === "surrounding_whitespace"
      )
    ).toBe(true);
  });
});

describe("change password schema", () => {
  it("requires the confirmation to match", () => {
    const mismatch = changePasswordSchema.safeParse({
      currentPassword: "old-fictional-pass",
      newPassword: COMPLIANT,
      confirmPassword: `${COMPLIANT}x`,
    });
    expect(mismatch.success).toBe(false);

    const match = changePasswordSchema.safeParse({
      currentPassword: "old-fictional-pass",
      newPassword: COMPLIANT,
      confirmPassword: COMPLIANT,
    });
    expect(match.success).toBe(true);
  });

  it("applies the policy to the new password", () => {
    const weak = changePasswordSchema.safeParse({
      currentPassword: "old-fictional-pass",
      newPassword: "short",
      confirmPassword: "short",
    });
    expect(weak.success).toBe(false);
  });
});
