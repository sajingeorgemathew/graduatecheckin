import { describe, expect, it } from "vitest";

import {
  DistributionConfigurationError,
  canonicalDeliveryPayload,
  distributionSecretFingerprint,
  signDeliveryRow,
  validateDistributionSecret,
  verifyDeliveryRow,
  type DeliverySignaturePayload,
} from "@/features/distribution/signing";

// A synthetic, fictional 32-byte secret. Never a real value.
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function payload(
  overrides: Partial<DeliverySignaturePayload> = {}
): DeliverySignaturePayload {
  return {
    deliveryReference: "DR-ABC123DEF456",
    deliveryBatchCode: "DLV-2026-AB12CD",
    eventCode: "CONVOCATION-2026",
    deliveryMode: "production",
    deliveryPurpose: "initial",
    intendedRecipientEmail: "graduate@example.com",
    ticketCode: "TAE-0001",
    documentVersion: 1,
    pdfFileName: "TAE-Convocation-2026-0001-V1.pdf",
    pdfSha256: "a".repeat(64),
    totalPartyCount: 3,
    ...overrides,
  };
}

describe("distribution secret validation", () => {
  it("requires at least 32 bytes of entropy", () => {
    expect(validateDistributionSecret(undefined).configured).toBe(false);
    expect(validateDistributionSecret("short").valid).toBe(false);
    expect(validateDistributionSecret(SECRET).valid).toBe(true);
  });

  it("produces a stable one-way fingerprint that is not the secret", () => {
    const fingerprint = distributionSecretFingerprint(SECRET);
    expect(fingerprint).toHaveLength(12);
    expect(SECRET).not.toContain(fingerprint);
  });

  it("throws a safe configuration error when signing without a secret", () => {
    expect(() => signDeliveryRow(payload(), "weak")).toThrow(
      DistributionConfigurationError
    );
  });
});

describe("delivery row signature", () => {
  it("verifies a freshly signed row", () => {
    const signature = signDeliveryRow(payload(), SECRET);
    expect(verifyDeliveryRow(payload(), signature, SECRET).valid).toBe(true);
  });

  it("is deterministic for the same payload and secret", () => {
    expect(signDeliveryRow(payload(), SECRET)).toBe(
      signDeliveryRow(payload(), SECRET)
    );
  });

  it("rejects a modified recipient email", () => {
    const signature = signDeliveryRow(payload(), SECRET);
    const tampered = payload({ intendedRecipientEmail: "attacker@example.com" });
    const result = verifyDeliveryRow(tampered, signature, SECRET);
    expect(result.valid).toBe(false);
  });

  it("rejects a modified PDF checksum", () => {
    const signature = signDeliveryRow(payload(), SECRET);
    const tampered = payload({ pdfSha256: "b".repeat(64) });
    expect(verifyDeliveryRow(tampered, signature, SECRET).valid).toBe(false);
  });

  it("rejects a modified party count", () => {
    const signature = signDeliveryRow(payload(), SECRET);
    expect(
      verifyDeliveryRow(payload({ totalPartyCount: 9 }), signature, SECRET).valid
    ).toBe(false);
  });

  it("rejects a malformed signature", () => {
    const result = verifyDeliveryRow(payload(), "not-a-signature", SECRET);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("malformed");
    }
  });

  it("canonical form is injective across field boundaries", () => {
    const a = canonicalDeliveryPayload(
      payload({ deliveryReference: "AB", ticketCode: "C" })
    );
    const b = canonicalDeliveryPayload(
      payload({ deliveryReference: "A", ticketCode: "BC" })
    );
    expect(a).not.toBe(b);
  });
});
