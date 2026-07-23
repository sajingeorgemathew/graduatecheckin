/**
 * Request validation for the Manual Delivery Desk. Every mutating route
 * parses its body here first, so an unvalidated value never reaches the
 * service layer or the database.
 */

import { z } from "zod";
import { MANUAL_DELIVERY_FILTERS, MAX_REASON_LENGTH, MIN_REASON_LENGTH } from "./constants";

export const registrationIdSchema = z.uuid();

export const manualDeliveryFilterSchema = z
  .enum(MANUAL_DELIVERY_FILTERS)
  .catch("all");

export const manualDeliverySearchSchema = z
  .string()
  .trim()
  .max(120)
  .catch("");

const reasonSchema = z
  .string()
  .trim()
  .min(MIN_REASON_LENGTH)
  .max(MAX_REASON_LENGTH);

const optionalNote = z
  .string()
  .trim()
  .max(1000)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional();

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional();

/**
 * Recording a manual send. The idempotency key is required so a
 * double-clicked Mark sent button records one attempt, never two.
 */
export const markManuallySentSchema = z.object({
  registrationId: registrationIdSchema,
  idempotencyKey: z.string().trim().min(8).max(200),
  actualRecipient: optionalEmail,
  note: optionalNote,
  gmailMessageId: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional(),
});

/** A resend keeps the same valid ticket and always requires a reason. */
export const recordResendSchema = markManuallySentSchema.extend({
  reason: reasonSchema,
});

/**
 * A replacement is a different action: it issues a new ticket and PDF and
 * invalidates the previous QR code, so it always requires a reason.
 */
export const replaceTicketSchema = z.object({
  registrationId: registrationIdSchema,
  reason: reasonSchema,
  idempotencyKey: z.string().trim().min(8).max(200),
});

export type MarkManuallySentInput = z.infer<typeof markManuallySentSchema>;
export type RecordResendInput = z.infer<typeof recordResendSchema>;
export type ReplaceTicketInput = z.infer<typeof replaceTicketSchema>;
