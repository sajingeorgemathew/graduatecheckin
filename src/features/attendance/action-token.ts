/**
 * Short-lived server-signed attendance action references.
 *
 * A manual search never exposes a registration UUID to the browser. Instead
 * the server returns a signed registration reference of the form
 *
 *   ra1.<registration-id>.<expiry>.<signature>
 *
 * and reversible attendance entries are addressed by a signed entry
 * reference of the form
 *
 *   en1.<checkin-id>.<expiry>.<signature>
 *
 * The signature is an HMAC SHA-256 over the reference kind, the identifier,
 * the expiry and the active event code, encoded as Base64URL. The signing
 * key is derived from TICKET_TOKEN_SECRET with HKDF and a distinct context,
 * so the ticket-token key and this key never coincide.
 *
 * References live only in current React memory. They are never persisted,
 * never logged, never placed in a URL, query string, cookie, localStorage or
 * sessionStorage, and expire within fifteen minutes. Verification is
 * constant-time and rejects tampering, expiry, wrong-event and malformed
 * values with a single generic reason.
 */

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export const REGISTRATION_REFERENCE_PREFIX = "ra1";
export const ENTRY_REFERENCE_PREFIX = "en1";

export type ActionReferenceKind =
  | typeof REGISTRATION_REFERENCE_PREFIX
  | typeof ENTRY_REFERENCE_PREFIX;

/** Maximum lifetime of any signed reference, in seconds. */
export const MAX_REFERENCE_LIFETIME_SECONDS = 15 * 60;

/** Minimum entropy the shared secret must provide, in bytes. */
const MIN_SECRET_ENTROPY_BYTES = 32;

const HKDF_INFO = "tae-graduation-attendance-action-v1";

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Raised when attendance references are built or verified without a usable
 * secret. The message is safe and never contains the secret value.
 */
export class AttendanceReferenceConfigurationError extends Error {
  constructor() {
    super(
      "TICKET_TOKEN_SECRET is missing or does not provide at least 32 bytes " +
        "of entropy. Configure it before signing attendance references."
    );
    this.name = "AttendanceReferenceConfigurationError";
  }
}

function secretKeyMaterial(secret: string): Buffer {
  const trimmed = secret.trim();
  if (trimmed.length > 0 && trimmed.length % 4 === 0 && BASE64_PATTERN.test(trimmed)) {
    return Buffer.from(trimmed, "base64");
  }
  return Buffer.from(trimmed, "utf8");
}

function isSecretUsable(secret: string): boolean {
  return secretKeyMaterial(secret).length >= MIN_SECRET_ENTROPY_BYTES;
}

function signingKey(secret: string): Buffer {
  if (!isSecretUsable(secret)) {
    throw new AttendanceReferenceConfigurationError();
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

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Encodes a UUID as the Base64URL of its sixteen bytes so the canonical
 * hyphenated UUID string never appears in a reference. This keeps a database
 * UUID out of any browser-facing value while remaining reversible on the
 * server after the signature is verified.
 */
function encodeUuid(uuid: string): string {
  return Buffer.from(uuid.replace(/-/g, ""), "hex").toString("base64url");
}

function decodeUuid(encoded: string): string | null {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(encoded, "base64url");
  } catch {
    return null;
  }
  if (bytes.length !== 16) {
    return null;
  }
  const hex = bytes.toString("hex");
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return UUID_PATTERN.test(uuid) ? uuid : null;
}

/** The exact payload that is signed. The event code binds the reference. */
function referencePayload(
  kind: ActionReferenceKind,
  encodedId: string,
  expiry: number,
  eventCode: string
): string {
  return `${kind}.${encodedId}.${expiry}.${eventCode}`;
}

function signReference(
  kind: ActionReferenceKind,
  encodedId: string,
  expiry: number,
  eventCode: string,
  secret: string
): Buffer {
  return createHmac("sha256", signingKey(secret))
    .update(referencePayload(kind, encodedId, expiry, eventCode))
    .digest();
}

export interface CreateReferenceOptions {
  /** Lifetime in seconds. Clamped to at most the maximum lifetime. */
  ttlSeconds?: number;
  /** Current time in epoch milliseconds. Defaults to Date.now. */
  now?: number;
}

function createReference(
  kind: ActionReferenceKind,
  id: string,
  eventCode: string,
  secret: string,
  options: CreateReferenceOptions = {}
): string {
  const normalizedId = id.trim().toLowerCase();
  if (!isUuid(normalizedId)) {
    throw new Error("A valid identifier is required to sign a reference.");
  }
  const encodedId = encodeUuid(normalizedId);
  const nowMs = options.now ?? Date.now();
  const ttl = Math.min(
    Math.max(options.ttlSeconds ?? MAX_REFERENCE_LIFETIME_SECONDS, 1),
    MAX_REFERENCE_LIFETIME_SECONDS
  );
  const expiry = Math.floor(nowMs / 1000) + ttl;
  const signature = signReference(
    kind,
    encodedId,
    expiry,
    eventCode,
    secret
  ).toString("base64url");
  return `${kind}.${encodedId}.${expiry}.${signature}`;
}

export type ReferenceVerification =
  | { valid: true; id: string }
  | { valid: false; reason: "invalid" | "expired" };

function verifyReference(
  kind: ActionReferenceKind,
  token: string,
  eventCode: string,
  secret: string,
  options: { now?: number } = {}
): ReferenceVerification {
  const parts = token.split(".");
  if (parts.length !== 4 || parts.some((part) => part.length === 0)) {
    return { valid: false, reason: "invalid" };
  }
  const [prefix, encodedId, expiryRaw, signature] = parts;
  const decodedId = decodeUuid(encodedId);
  if (prefix !== kind || decodedId === null) {
    return { valid: false, reason: "invalid" };
  }
  if (!/^[0-9]+$/.test(expiryRaw)) {
    return { valid: false, reason: "invalid" };
  }
  const expiry = Number.parseInt(expiryRaw, 10);
  if (!Number.isFinite(expiry)) {
    return { valid: false, reason: "invalid" };
  }

  const expected = signReference(kind, encodedId, expiry, eventCode, secret);
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "base64url");
  } catch {
    return { valid: false, reason: "invalid" };
  }
  if (provided.length !== expected.length) {
    return { valid: false, reason: "invalid" };
  }
  if (!timingSafeEqual(provided, expected)) {
    return { valid: false, reason: "invalid" };
  }

  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  if (expiry <= nowSeconds) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, id: decodedId };
}

export function createRegistrationReference(
  registrationId: string,
  eventCode: string,
  secret: string,
  options?: CreateReferenceOptions
): string {
  return createReference(
    REGISTRATION_REFERENCE_PREFIX,
    registrationId,
    eventCode,
    secret,
    options
  );
}

export function verifyRegistrationReference(
  token: string,
  eventCode: string,
  secret: string,
  options?: { now?: number }
): ReferenceVerification {
  return verifyReference(
    REGISTRATION_REFERENCE_PREFIX,
    token,
    eventCode,
    secret,
    options
  );
}

export function createEntryReference(
  checkinId: string,
  eventCode: string,
  secret: string,
  options?: CreateReferenceOptions
): string {
  return createReference(
    ENTRY_REFERENCE_PREFIX,
    checkinId,
    eventCode,
    secret,
    options
  );
}

export function verifyEntryReference(
  token: string,
  eventCode: string,
  secret: string,
  options?: { now?: number }
): ReferenceVerification {
  return verifyReference(
    ENTRY_REFERENCE_PREFIX,
    token,
    eventCode,
    secret,
    options
  );
}
