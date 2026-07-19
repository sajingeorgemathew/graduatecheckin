/**
 * Zod schemas for attendance inputs. Every route parses its JSON body with
 * these before any database work. Schemas are strict so the browser can
 * never smuggle an event id, actor id or registration UUID into a request:
 * registrations and reversible entries are addressed only by signed
 * references, and any unexpected key fails validation.
 */

import { z } from "zod";
import {
  MAX_ARRIVING_PER_CATEGORY,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
} from "./constants";

/** A signed reference string. Never a database UUID. */
const referenceSchema = z.string().min(8).max(400);

const reasonSchema = z
  .string()
  .trim()
  .min(MIN_REASON_LENGTH)
  .max(MAX_REASON_LENGTH);

export const searchFiltersSchema = z
  .object({
    attendanceStatus: z
      .enum(["all", "not_arrived", "partial", "complete"])
      .default("all"),
    registrationStatus: z
      .enum(["all", "eligible", "review_required", "cancelled", "failed"])
      .default("all"),
    ticketStatus: z
      .enum(["all", "active", "none", "replaced", "revoked", "pending"])
      .default("all"),
    environment: z.enum(["all", "test", "production"]).default("all"),
    rsvpStatus: z.enum(["all", "signed_up"]).default("all"),
  })
  .strict();

/**
 * The term is optional so a supervisor can browse by filter alone, for
 * example every signed-up registration. An empty term with only default
 * filters yields no results, which clears the display.
 */
export const searchSchema = z
  .object({
    field: z.enum(["name", "ticket_code", "source_id"]),
    term: z.string().trim().max(100).default(""),
    filters: searchFiltersSchema.default(searchFiltersSchema.parse({})),
  })
  .strict();

export type SearchInput = z.infer<typeof searchSchema>;

export const detailSchema = z
  .object({
    registrationReference: referenceSchema,
  })
  .strict();

export type DetailInput = z.infer<typeof detailSchema>;

const arrivingSchema = z.number().int().min(0).max(MAX_ARRIVING_PER_CATEGORY);

export const manualArrivalSchema = z
  .object({
    registrationReference: referenceSchema,
    requestId: z.uuid(),
    graduateArriving: z.number().int().min(0).max(1),
    adultGuestsArriving: arrivingSchema,
    children0To4Arriving: arrivingSchema,
    children5To10Arriving: arrivingSchema,
    reason: reasonSchema,
  })
  .strict();

export type ManualArrivalInput = z.infer<typeof manualArrivalSchema>;

const graduateDeltaSchema = z.number().int().min(-1).max(1);
const guestDeltaSchema = z.number().int().min(-2).max(2);

export const correctionSchema = z
  .object({
    registrationReference: referenceSchema,
    requestId: z.uuid(),
    graduateDelta: graduateDeltaSchema,
    adultGuestDelta: guestDeltaSchema,
    child0To4Delta: guestDeltaSchema,
    child5To10Delta: guestDeltaSchema,
    reason: reasonSchema,
  })
  .strict();

export type CorrectionInput = z.infer<typeof correctionSchema>;

export const reversalSchema = z
  .object({
    entryReference: referenceSchema,
    requestId: z.uuid(),
    reason: reasonSchema,
  })
  .strict();

export type ReversalInput = z.infer<typeof reversalSchema>;
