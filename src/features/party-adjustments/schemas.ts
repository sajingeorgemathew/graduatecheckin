/**
 * Request validation for an administrator party adjustment.
 *
 * Every count is a non-negative whole number with no business maximum: the
 * academy raises or lowers a registered party freely after a late RSVP, a
 * paid extra guest, a correction or a cancellation. The actor and the event
 * are always resolved server-side and are never accepted here.
 */

import { z } from "zod";

/** A non-negative safe whole number. Fractional and negative values fail. */
const wholeCount = z.number().int().min(0);

export const partyAdjustmentSchema = z
  .object({
    registrationId: z.uuid(),
    adultGuestCount: wholeCount,
    adultGuestNames: z.array(z.string().trim().min(1).max(200)).default([]),
    children04: wholeCount,
    children510: wholeCount,
    reason: z.string().trim().min(5).max(500),
    paymentNote: z
      .string()
      .trim()
      .max(500)
      .transform((value) => (value.length === 0 ? null : value))
      .nullable()
      .optional(),
    /**
     * The administrator must confirm they understand the same QR stays
     * active. The adjustment never proceeds without it.
     */
    confirmSameQr: z.literal(true),
    idempotencyKey: z.string().trim().min(8).max(200),
    /**
     * The registration updated_at the editor was rendered from, used for
     * optimistic concurrency. Null skips the check for a first-class caller
     * that has no baseline.
     */
    expectedUpdatedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .refine((value) => value.adultGuestNames.length <= value.adultGuestCount, {
    message: "More guest names were supplied than adult guests.",
    path: ["adultGuestNames"],
  });

export type PartyAdjustmentInput = z.infer<typeof partyAdjustmentSchema>;
