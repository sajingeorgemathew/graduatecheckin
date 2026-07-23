/**
 * Request validation for the production-import API. Every mutating route
 * parses its body here first, so an unvalidated value never reaches the
 * service layer or the database.
 */

import { z } from "zod";
import {
  APPLY_CONFIRMATION_TEXT,
  MAX_ADULT_GUESTS,
  MAX_CHILDREN_PER_GROUP,
  MAX_COMBINED_CHILDREN,
} from "./constants";

export const uuidSchema = z.uuid();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

/**
 * The administrator's reconciliation decision for one graduate. Approving a
 * party with an unpaid guest requires a note, so an entitlement override is
 * always recorded with a reason.
 */
export const reconcileGraduateSchema = z
  .object({
    decision: z.enum(["needs_review", "approved", "excluded"]),
    canonicalFullName: z.string().trim().min(1).max(200).optional(),
    email: optionalText(254),
    phone: optionalText(40),
    gownSize: optionalText(60),
    namePronunciation: optionalText(300),
    approvedAdultGuests: z.number().int().min(0).max(MAX_ADULT_GUESTS),
    approvedChildren04: z.number().int().min(0).max(MAX_CHILDREN_PER_GROUP),
    approvedChildren510: z.number().int().min(0).max(MAX_CHILDREN_PER_GROUP),
    approvedAdultGuestNames: z
      .array(z.string().trim().min(1).max(200))
      .max(MAX_ADULT_GUESTS),
    reconciliationNote: optionalText(1000),
  })
  .refine(
    (value) =>
      value.approvedChildren04 + value.approvedChildren510 <=
      MAX_COMBINED_CHILDREN,
    {
      message: "At most two children in total may be registered.",
      path: ["approvedChildren510"],
    }
  )
  .refine(
    (value) =>
      value.approvedAdultGuestNames.length <= value.approvedAdultGuests,
    {
      message: "More guest names were supplied than approved adult guests.",
      path: ["approvedAdultGuestNames"],
    }
  );

export type ReconcileGraduateInput = z.infer<typeof reconcileGraduateSchema>;

export const applyProductionImportSchema = z.object({
  confirmationText: z.literal(APPLY_CONFIRMATION_TEXT),
});

export const excludeSourceOrderSchema = z.object({
  exclude: z.boolean(),
});
