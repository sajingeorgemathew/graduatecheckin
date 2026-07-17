import { describe, expect, it } from "vitest";
import { validatePassword } from "@/features/auth/password-policy";
import {
  generateTemporaryPassword,
  TEMPORARY_PASSWORD_LENGTH,
} from "@/features/auth/temporary-password";

describe("temporary password generation", () => {
  it("always meets the password policy", () => {
    for (let index = 0; index < 50; index += 1) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
      expect(validatePassword(password)).toEqual([]);
    }
  });

  it("contains every required character class", () => {
    const password = generateTemporaryPassword();
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[^A-Za-z0-9\s]/);
  });

  it("is non-deterministic", () => {
    const generated = new Set<string>();
    for (let index = 0; index < 20; index += 1) {
      generated.add(generateTemporaryPassword());
    }
    expect(generated.size).toBe(20);
  });
});
