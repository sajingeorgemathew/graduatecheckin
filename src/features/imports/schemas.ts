/**
 * Zod schemas for import route inputs. Every mutation validates its IDs and
 * payload with these schemas before any work happens.
 */

import { z } from "zod";
import { APPLY_CONFIRMATION_TEXT } from "./constants";

export const importIdSchema = z.uuid();

export const importRowIdSchema = z.uuid();

export const rowInclusionSchema = z.object({
  include: z.boolean(),
});

export const applyImportSchema = z.object({
  confirmation: z.literal(APPLY_CONFIRMATION_TEXT),
  /** Client-generated key that guards against double submission. */
  idempotencyKey: z.uuid(),
});

export type RowInclusionInput = z.infer<typeof rowInclusionSchema>;

export type ApplyImportInput = z.infer<typeof applyImportSchema>;
