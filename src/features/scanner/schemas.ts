/**
 * Zod schemas for scanner inputs. The validation route parses its JSON
 * body with these before any database work. Invalid values are never
 * echoed back in error messages.
 */

import { z } from "zod";
import { MAX_MANUAL_CODE_LENGTH, MAX_QR_VALUE_LENGTH } from "./constants";

export const scanMethodSchema = z.enum(["qr", "manual_code"]);

export const validateScanSchema = z
  .object({
    method: scanMethodSchema,
    value: z.string().min(1).max(MAX_QR_VALUE_LENGTH),
    requestId: z.uuid(),
  })
  .superRefine((input, ctx) => {
    if (input.value.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "A non-empty value is required.",
      });
    }
    if (
      input.method === "manual_code" &&
      input.value.trim().length > MAX_MANUAL_CODE_LENGTH
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "The ticket code is too long.",
      });
    }
  });

export type ValidateScanInput = z.infer<typeof validateScanSchema>;
