/**
 * Versioned ticket-token service.
 *
 * A ticket token has the structure v1.<ticket-id>.<signature> where the
 * signature is an HMAC SHA-256 over the version and ticket UUID, encoded
 * as Base64URL. The signing key is derived from TICKET_TOKEN_SECRET with
 * HKDF, so the secret itself is never used directly as key material.
 *
 * Raw tokens exist only in server memory while a QR image is rendered or
 * a scanned token is validated. They are never persisted, never logged,
 * never placed in URLs and never returned to browser-facing code. Only the
 * SHA-256 hash of a token is stored in graduation_tickets.token_hash.
 *
 * Changing TICKET_TOKEN_SECRET after tickets are issued invalidates every
 * existing QR ticket. The secret is never regenerated automatically.
 */

import {
  createHash,
  createHmac,
  hkdfSync,
  timingSafeEqual,
} from "node:crypto";

export const TICKET_TOKEN_VERSION = 1;

const TOKEN_VERSION_LABEL = "v1";

/** Minimum entropy the ticket secret must provide, in bytes. */
export const MIN_SECRET_ENTROPY_BYTES = 32;

const HKDF_INFO = "tae-graduation-ticket-token-v1";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Raised when ticket operations run without a usable secret. The message
 * is safe to show and never contains the secret value.
 */
export class TicketConfigurationError extends Error {
  constructor() {
    super(
      "TICKET_TOKEN_SECRET is missing or does not provide at least 32 bytes " +
        "of entropy. Configure it before running ticket operations."
    );
    this.name = "TicketConfigurationError";
  }
}

export interface TicketSecretValidation {
  configured: boolean;
  valid: boolean;
  entropyBytes: number;
}

/**
 * Interprets the secret as Base64 when it decodes cleanly, matching the
 * documented Base64 generation command, and as UTF-8 bytes otherwise.
 */
function secretKeyMaterial(secret: string): Buffer {
  const trimmed = secret.trim();
  if (trimmed.length % 4 === 0 && BASE64_PATTERN.test(trimmed)) {
    return Buffer.from(trimmed, "base64");
  }
  return Buffer.from(trimmed, "utf8");
}

/** Validates the secret without ever exposing its value. */
export function validateTicketSecret(
  secret: string | undefined
): TicketSecretValidation {
  const trimmed = (secret ?? "").trim();
  if (trimmed.length === 0) {
    return { configured: false, valid: false, entropyBytes: 0 };
  }
  const entropyBytes = secretKeyMaterial(trimmed).length;
  return {
    configured: true,
    valid: entropyBytes >= MIN_SECRET_ENTROPY_BYTES,
    entropyBytes,
  };
}

/**
 * One-way SHA-256 fingerprint of the secret for administrative comparison
 * between environments. The fingerprint never reveals the secret.
 */
export function ticketSecretFingerprint(secret: string): string {
  return createHash("sha256")
    .update(secretKeyMaterial(secret))
    .digest("hex")
    .slice(0, 12);
}

function signingKey(secret: string): Buffer {
  if (!validateTicketSecret(secret).valid) {
    throw new TicketConfigurationError();
  }
  const derived = hkdfSync(
    "sha256",
    secretKeyMaterial(secret),
    Buffer.alloc(0),
    HKDF_INFO,
    32
  );
  return Buffer.from(derived);
}

function signPayload(payload: string, secret: string): Buffer {
  return createHmac("sha256", signingKey(secret)).update(payload).digest();
}

export function isTicketUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Builds the raw token for a ticket row. The token is reproducible for the
 * same ticket UUID and secret, and changes completely when the ticket UUID
 * changes, so a replaced ticket always receives a different token.
 */
export function buildTicketToken(ticketId: string, secret: string): string {
  const normalizedId = ticketId.trim().toLowerCase();
  if (!isTicketUuid(normalizedId)) {
    throw new Error("A valid ticket UUID is required to build a token.");
  }
  const payload = `${TOKEN_VERSION_LABEL}.${normalizedId}`;
  const signature = signPayload(payload, secret).toString("base64url");
  return `${payload}.${signature}`;
}

export type TicketTokenVerification =
  | { valid: true; ticketId: string }
  | {
      valid: false;
      reason:
        | "malformed"
        | "unknown_version"
        | "invalid_ticket_id"
        | "invalid_signature";
    };

/**
 * Verifies a raw token. Signature comparison uses timingSafeEqual so the
 * comparison time never depends on how many bytes match.
 */
export function verifyTicketToken(
  token: string,
  secret: string
): TicketTokenVerification {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return { valid: false, reason: "malformed" };
  }
  const [version, ticketId, signature] = parts;
  if (version !== TOKEN_VERSION_LABEL) {
    return { valid: false, reason: "unknown_version" };
  }
  if (!isTicketUuid(ticketId)) {
    return { valid: false, reason: "invalid_ticket_id" };
  }

  const expected = signPayload(`${version}.${ticketId}`, secret);
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "base64url");
  } catch {
    return { valid: false, reason: "invalid_signature" };
  }
  if (provided.length !== expected.length) {
    return { valid: false, reason: "invalid_signature" };
  }
  if (!timingSafeEqual(provided, expected)) {
    return { valid: false, reason: "invalid_signature" };
  }
  return { valid: true, ticketId };
}

/**
 * SHA-256 hash of a raw token as 64 lowercase hexadecimal characters. Only
 * this hash may ever be persisted.
 */
export function hashTicketToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;
