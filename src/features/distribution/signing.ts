/**
 * Delivery-row signing for CHECKIN-09B ticket distribution.
 *
 * Every send-queue row the app exports carries a row_signature. The
 * signature is an HMAC SHA-256 over the immutable delivery fields, keyed by
 * a value derived from TICKET_DISTRIBUTION_SECRET with HKDF. It proves two
 * things when a results CSV is imported back:
 *
 *   1. The row was prepared by this application (authenticity).
 *   2. Nothing that identifies the delivery — recipient, ticket, PDF
 *      checksum, mode — was altered in the Google Sheet before sending
 *      (integrity).
 *
 * The signature itself is NOT secret. It is safe to place in the exported
 * CSV and to read back. TICKET_DISTRIBUTION_SECRET, by contrast, is a
 * server-only secret and is deliberately separate from TICKET_TOKEN_SECRET:
 * distribution signing must never be able to forge a QR admission token,
 * and a leaked distribution secret must never compromise ticket tokens.
 *
 * This module is runtime-neutral on purpose. It never imports "server-only"
 * and never reads process.env, so the same create/verify code runs inside
 * the Next.js server, inside tsx CLI scripts and inside unit tests. The
 * secret is always passed in by the caller.
 */

import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/** Minimum entropy the distribution secret must provide, in bytes. */
export const MIN_DISTRIBUTION_SECRET_ENTROPY_BYTES = 32;

/** Signature scheme label. Bumped only if the canonical form changes. */
export const DELIVERY_SIGNATURE_VERSION = "dsig.v1";

const HKDF_INFO = "tae-graduation-ticket-distribution-v1";

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/** A signature is Base64URL of a 32-byte HMAC, so 43 URL-safe characters. */
export const DELIVERY_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Raised when distribution operations run without a usable secret. The
 * message never contains the secret value.
 */
export class DistributionConfigurationError extends Error {
  constructor() {
    super(
      "TICKET_DISTRIBUTION_SECRET is missing or does not provide at least " +
        "32 bytes of entropy. Configure it before preparing deliveries."
    );
    this.name = "DistributionConfigurationError";
  }
}

export interface DistributionSecretValidation {
  configured: boolean;
  valid: boolean;
  entropyBytes: number;
}

/**
 * Interprets the secret as Base64 when it decodes cleanly (matching the
 * documented `openssl rand -base64 32` generation command) and as UTF-8
 * bytes otherwise.
 */
function secretKeyMaterial(secret: string): Buffer {
  const trimmed = secret.trim();
  if (trimmed.length > 0 && trimmed.length % 4 === 0 && BASE64_PATTERN.test(trimmed)) {
    return Buffer.from(trimmed, "base64");
  }
  return Buffer.from(trimmed, "utf8");
}

/** Validates the secret without ever exposing its value. */
export function validateDistributionSecret(
  secret: string | undefined
): DistributionSecretValidation {
  const trimmed = (secret ?? "").trim();
  if (trimmed.length === 0) {
    return { configured: false, valid: false, entropyBytes: 0 };
  }
  const entropyBytes = secretKeyMaterial(trimmed).length;
  return {
    configured: true,
    valid: entropyBytes >= MIN_DISTRIBUTION_SECRET_ENTROPY_BYTES,
    entropyBytes,
  };
}

/**
 * One-way SHA-256 fingerprint of the secret for administrative comparison
 * between environments. It never reveals the secret and is intentionally
 * distinct from the ticket-token fingerprint because the two secrets are
 * different values.
 */
export function distributionSecretFingerprint(secret: string): string {
  return createHash("sha256")
    .update(HKDF_INFO)
    .update(secretKeyMaterial(secret))
    .digest("hex")
    .slice(0, 12);
}

function signingKey(secret: string): Buffer {
  if (!validateDistributionSecret(secret).valid) {
    throw new DistributionConfigurationError();
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

/**
 * The immutable identity of a delivery row. Every field here is part of the
 * signed payload; changing any of them in the Sheet invalidates the
 * signature on import. The party summary is included so guest counts cannot
 * be silently edited between preparation and sending.
 */
export interface DeliverySignaturePayload {
  deliveryReference: string;
  deliveryBatchCode: string;
  eventCode: string;
  deliveryMode: string;
  deliveryPurpose: string;
  intendedRecipientEmail: string;
  ticketCode: string;
  documentVersion: number | string;
  pdfFileName: string;
  pdfSha256: string;
  totalPartyCount: number | string;
}

/** Normalizes a value so signing is stable across whitespace and case where safe. */
function field(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Builds the canonical, unambiguous string that is signed. Each field is
 * length-prefixed so no combination of values can be rearranged to produce
 * the same payload (canonicalization is injective).
 */
export function canonicalDeliveryPayload(
  payload: DeliverySignaturePayload
): string {
  const parts = [
    DELIVERY_SIGNATURE_VERSION,
    field(payload.deliveryReference),
    field(payload.deliveryBatchCode),
    field(payload.eventCode),
    field(payload.deliveryMode).toLowerCase(),
    field(payload.deliveryPurpose).toLowerCase(),
    field(payload.intendedRecipientEmail).toLowerCase(),
    field(payload.ticketCode),
    String(payload.documentVersion).trim(),
    field(payload.pdfFileName),
    field(payload.pdfSha256).toLowerCase(),
    String(payload.totalPartyCount).trim(),
  ];
  return parts.map((part) => `${part.length}:${part}`).join("\n");
}

/** Produces the Base64URL row signature for a delivery payload. */
export function signDeliveryRow(
  payload: DeliverySignaturePayload,
  secret: string
): string {
  return createHmac("sha256", signingKey(secret))
    .update(canonicalDeliveryPayload(payload))
    .digest("base64url");
}

export type DeliverySignatureVerification =
  | { valid: true }
  | { valid: false; reason: "malformed" | "invalid_signature" };

/**
 * Verifies a row signature against a payload. Comparison uses
 * timingSafeEqual so the comparison time never depends on how many bytes
 * match.
 */
export function verifyDeliveryRow(
  payload: DeliverySignaturePayload,
  signature: string,
  secret: string
): DeliverySignatureVerification {
  const trimmed = (signature ?? "").trim();
  if (!DELIVERY_SIGNATURE_PATTERN.test(trimmed)) {
    return { valid: false, reason: "malformed" };
  }
  const expected = createHmac("sha256", signingKey(secret))
    .update(canonicalDeliveryPayload(payload))
    .digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(trimmed, "base64url");
  } catch {
    return { valid: false, reason: "invalid_signature" };
  }
  if (provided.length !== expected.length) {
    return { valid: false, reason: "invalid_signature" };
  }
  if (!timingSafeEqual(provided, expected)) {
    return { valid: false, reason: "invalid_signature" };
  }
  return { valid: true };
}
