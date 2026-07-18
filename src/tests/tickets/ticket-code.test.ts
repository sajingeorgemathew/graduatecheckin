import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  generateTicketCode,
  generateUniqueTicketCode,
  isValidTicketCode,
  TICKET_CODE_ALPHABET,
  TICKET_CODE_PATTERN,
} from "@/features/tickets/ticket-code";

describe("ticket codes", () => {
  it("matches the GR26-XXXX-XXXX format", () => {
    for (let i = 0; i < 25; i += 1) {
      const code = generateTicketCode();
      expect(code).toMatch(TICKET_CODE_PATTERN);
      expect(isValidTicketCode(code)).toBe(true);
    }
  });

  it("uses only the allowed character set", () => {
    const code = generateTicketCode();
    for (const character of code.replace("GR26-", "").replace("-", "")) {
      expect(TICKET_CODE_ALPHABET).toContain(character);
    }
  });

  it("excludes ambiguous characters from the alphabet", () => {
    for (const ambiguous of ["0", "O", "1", "I", "L"]) {
      expect(TICKET_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it("draws randomness from node:crypto randomInt by default", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../features/tickets/ticket-code.ts", import.meta.url)
      ),
      "utf8"
    );
    expect(source).toContain('from "node:crypto"');
    expect(source).toContain("randomInt");
    expect(source).not.toContain("Math.random");
  });

  it("is deterministic under an injected random source", () => {
    const fixed = generateTicketCode(() => 0);
    expect(fixed).toBe("GR26-2222-2222");
  });

  it("retries after a collision with the taken set", () => {
    let draws = 0;
    // The first full code repeats an already taken code; the retry draws
    // a different character sequence.
    const random = () => {
      draws += 1;
      return draws <= 8 ? 0 : 1;
    };
    const taken = new Set(["GR26-2222-2222"]);
    const code = generateUniqueTicketCode(taken, random);
    expect(code).toBe("GR26-3333-3333");
  });

  it("fails safely when no unique code can be drawn", () => {
    const taken = new Set(["GR26-2222-2222"]);
    expect(() => generateUniqueTicketCode(taken, () => 0, 5)).toThrow();
  });

  it("derives nothing from student information", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../features/tickets/ticket-code.ts", import.meta.url)
      ),
      "utf8"
    );
    // The generator takes no registration input at all.
    expect(source).not.toContain("graduate");
    expect(source).not.toContain("registration_id");
  });
});
