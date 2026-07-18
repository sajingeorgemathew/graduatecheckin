/**
 * QR payload format. The QR code contains exactly the versioned prefix
 * followed by the raw ticket token:
 *
 *   TAE-GRAD1:v1.<ticket-id>.<signature>
 *
 * No name, email, phone number, guest detail or payment detail is ever
 * encoded, and the payload is never an HTTP URL. The prefix lets the
 * CHECKIN-06 scanner reject unrelated QR codes before token verification.
 */

export const QR_PAYLOAD_PREFIX = "TAE-GRAD1:";

export function buildQrPayload(token: string): string {
  return `${QR_PAYLOAD_PREFIX}${token}`;
}

export type QrPayloadParseResult =
  | { ok: true; token: string }
  | { ok: false; reason: "blank" | "unknown_prefix" | "empty_token" };

/** Validates the prefix before any token verification happens. */
export function parseQrPayload(payload: string): QrPayloadParseResult {
  const trimmed = payload.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "blank" };
  }
  if (!trimmed.startsWith(QR_PAYLOAD_PREFIX)) {
    return { ok: false, reason: "unknown_prefix" };
  }
  const token = trimmed.slice(QR_PAYLOAD_PREFIX.length);
  if (token.length === 0) {
    return { ok: false, reason: "empty_token" };
  }
  return { ok: true, token };
}
