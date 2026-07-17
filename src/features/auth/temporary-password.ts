/**
 * Cryptographically secure temporary password generation. The generated
 * value is shown to the administrator exactly once and must never be
 * stored, logged or echoed anywhere else.
 */

import { randomInt } from "node:crypto";
import { isPasswordCompliant } from "./password-policy";

const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const NUMBERS = "23456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{}<>?";
const ALL_CHARACTERS = UPPERCASE + LOWERCASE + NUMBERS + SYMBOLS;

export const TEMPORARY_PASSWORD_LENGTH = 20;

function pick(characters: string): string {
  return characters[randomInt(characters.length)];
}

/**
 * Builds a policy-compliant password from crypto-grade randomness. One
 * character from each required class is guaranteed, the rest are drawn
 * from the full set, and the result is shuffled with a Fisher-Yates pass
 * that also uses crypto randomness.
 */
export function generateTemporaryPassword(): string {
  const characters: string[] = [
    pick(UPPERCASE),
    pick(LOWERCASE),
    pick(NUMBERS),
    pick(SYMBOLS),
  ];
  while (characters.length < TEMPORARY_PASSWORD_LENGTH) {
    characters.push(pick(ALL_CHARACTERS));
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapWith = randomInt(index + 1);
    const held = characters[index];
    characters[index] = characters[swapWith];
    characters[swapWith] = held;
  }

  const password = characters.join("");
  // The construction above always satisfies the policy. This check is a
  // final defensive guarantee before the value is used as a credential.
  if (!isPasswordCompliant(password)) {
    throw new Error("Temporary password generation failed the policy check.");
  }
  return password;
}
