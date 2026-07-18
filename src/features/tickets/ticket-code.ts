/**
 * Human-readable backup ticket codes such as GR26-ABCD-EFGH. The code is a
 * manual fallback for staff and never replaces secure QR-token validation.
 *
 * Codes are generated from cryptographically secure randomness and are
 * never derived from a student name, email, phone number or source order
 * ID. Ambiguous characters (0, O, 1, I, L) are excluded so codes can be
 * read aloud and typed without confusion. Uniqueness is enforced by the
 * database; a rare collision is retried with a fresh random code.
 */

import { randomInt } from "node:crypto";

export const TICKET_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const TICKET_CODE_PREFIX = "GR26";

export const TICKET_CODE_GROUP_LENGTH = 4;

export const TICKET_CODE_PATTERN =
  /^GR26-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

/** Draws a secure random index below max. Injectable for tests only. */
export type RandomIndexSource = (max: number) => number;

function randomGroup(random: RandomIndexSource): string {
  let group = "";
  for (let i = 0; i < TICKET_CODE_GROUP_LENGTH; i += 1) {
    group += TICKET_CODE_ALPHABET[random(TICKET_CODE_ALPHABET.length)];
  }
  return group;
}

export function generateTicketCode(
  random: RandomIndexSource = randomInt
): string {
  return `${TICKET_CODE_PREFIX}-${randomGroup(random)}-${randomGroup(random)}`;
}

export function isValidTicketCode(code: string): boolean {
  return TICKET_CODE_PATTERN.test(code);
}

/**
 * Generates a code that is not in the provided taken set, retrying after
 * a rare collision. The database unique constraint remains the final
 * authority; this keeps a bulk batch free of within-batch duplicates.
 */
export function generateUniqueTicketCode(
  taken: ReadonlySet<string>,
  random: RandomIndexSource = randomInt,
  maxAttempts = 20
): string {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateTicketCode(random);
    if (!taken.has(code)) {
      return code;
    }
  }
  throw new Error("Could not generate a unique ticket code.");
}
