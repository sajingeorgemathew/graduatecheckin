/**
 * Zod schemas for ticket-feature inputs. Every page and mutation validates
 * its inputs before any database work happens. The acting user always
 * comes from the trusted session and the event always comes from the
 * server configuration; neither is ever accepted from these inputs.
 */

import { z } from "zod";
import {
  GENERATE_CONFIRMATION_TEXT,
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  REPLACE_CONFIRMATION_TEXT,
  REVOKE_CONFIRMATION_TEXT,
} from "./constants";

export const ticketIdSchema = z.uuid();

export const ticketListFilterSchema = z
  .enum([
    "all",
    "active",
    "not_generated",
    "revoked",
    "replaced",
    "blocked",
    "test",
    "production",
  ])
  .default("all");

export const ticketListPageSchema = z.coerce.number().int().min(1).default(1);

/** Search terms are plain text: graduate name, ticket code or source ID. */
export const ticketSearchSchema = z.string().trim().max(120).default("");

export const generateTicketsSchema = z.object({
  registrationIds: z.array(z.uuid()).min(1).max(5000),
  confirmationText: z.literal(GENERATE_CONFIRMATION_TEXT),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export type GenerateTicketsInput = z.infer<typeof generateTicketsSchema>;

const reasonSchema = z
  .string()
  .trim()
  .min(REASON_MIN_LENGTH)
  .max(REASON_MAX_LENGTH);

export const replaceTicketSchema = z.object({
  reason: reasonSchema,
  confirmationText: z.literal(REPLACE_CONFIRMATION_TEXT),
});

export type ReplaceTicketInput = z.infer<typeof replaceTicketSchema>;

export const revokeTicketSchema = z.object({
  reason: reasonSchema,
  confirmationText: z.literal(REVOKE_CONFIRMATION_TEXT),
});

export type RevokeTicketInput = z.infer<typeof revokeTicketSchema>;
