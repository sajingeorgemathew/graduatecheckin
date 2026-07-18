import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  MAX_MANUAL_CODE_LENGTH,
  MAX_QR_VALUE_LENGTH,
} from "@/features/scanner/constants";
import { validateScanSchema } from "@/features/scanner/schemas";

describe("scanner request schema", () => {
  it("accepts a well-formed qr request", () => {
    const parsed = validateScanSchema.safeParse({
      method: "qr",
      value: "TAE-GRAD1:v1.example.example",
      requestId: randomUUID(),
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty and whitespace-only values", () => {
    for (const value of ["", "   "]) {
      const parsed = validateScanSchema.safeParse({
        method: "qr",
        value,
        requestId: randomUUID(),
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("caps qr values at the configured maximum", () => {
    const parsed = validateScanSchema.safeParse({
      method: "qr",
      value: "x".repeat(MAX_QR_VALUE_LENGTH + 1),
      requestId: randomUUID(),
    });
    expect(parsed.success).toBe(false);
  });

  it("caps manual codes at the shorter manual maximum", () => {
    const parsed = validateScanSchema.safeParse({
      method: "manual_code",
      value: "x".repeat(MAX_MANUAL_CODE_LENGTH + 1),
      requestId: randomUUID(),
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a UUID request id", () => {
    const parsed = validateScanSchema.safeParse({
      method: "qr",
      value: "TAE-GRAD1:v1.example.example",
      requestId: "not-a-uuid",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown methods", () => {
    const parsed = validateScanSchema.safeParse({
      method: "bulk",
      value: "TAE-GRAD1:v1.example.example",
      requestId: randomUUID(),
    });
    expect(parsed.success).toBe(false);
  });
});
