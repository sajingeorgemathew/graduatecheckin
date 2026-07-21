/**
 * Deterministic reference and code generation for CHECKIN-09B.
 *
 * Delivery references, attempt references and batch codes are opaque,
 * URL-safe and unique. They carry no personal data: they are built from a
 * fixed prefix and random bytes, never from a name, email or ticket code.
 */

import { randomBytes } from "node:crypto";

/** Format a delivery batch code must satisfy (mirrors the document batch). */
export const DELIVERY_BATCH_CODE_PATTERN = /^[A-Z0-9-]{6,40}$/;

/** Format a delivery or attempt reference must satisfy. */
export const DELIVERY_REFERENCE_PATTERN = /^[A-Z0-9-]{8,60}$/;

function randomToken(byteLength: number): string {
  return randomBytes(byteLength)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, byteLength * 2);
}

/** Builds a batch code like `DLV-2026-3F9A1C`. */
export function generateDeliveryBatchCode(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  return `DLV-${year}-${randomToken(4)}`;
}

/** Builds a delivery reference like `DR-8KQ2M4XPZ1`. */
export function generateDeliveryReference(): string {
  return `DR-${randomToken(6)}`;
}

/** Builds an attempt reference like `AT-7HN3P0RS9W`. */
export function generateAttemptReference(): string {
  return `AT-${randomToken(6)}`;
}

/**
 * Masks an email for list views: keeps the first character of the local
 * part and the domain, hiding the rest. Full addresses are only ever shown
 * in administrator detail views and controlled exports.
 */
export function maskEmail(email: string | null | undefined): string {
  const trimmed = (email ?? "").trim();
  if (trimmed.length === 0) {
    return "";
  }
  const at = trimmed.indexOf("@");
  if (at <= 0) {
    return "•••";
  }
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const head = local.charAt(0);
  return `${head}${"•".repeat(Math.max(local.length - 1, 1))}@${domain}`;
}
