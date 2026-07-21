/**
 * Zod schemas for ticket-document inputs. Every route validates its input
 * before any rendering, storage or database work happens.
 *
 * The acting user always comes from the trusted server session and the
 * event always comes from the server configuration; neither is ever
 * accepted from these inputs.
 */

import { z } from "zod";

import {
  CREATE_BATCH_CONFIRMATION_TEXT,
  EXPORT_BATCH_MAX_SIZE,
  GENERATE_DOCUMENTS_CONFIRMATION_TEXT,
  GENERATION_CHUNK_MAX,
} from "./constants";

export const documentIdSchema = z.uuid();
export const ticketIdSchema = z.uuid();
export const batchIdSchema = z.uuid();

export const documentListFilterSchema = z
  .enum([
    "all",
    "missing",
    "current",
    "outdated",
    "invalidated",
    "ready_for_export",
    "missing_email",
    "test",
    "production",
  ])
  .default("all");

/** One document. No confirmation text: it is a single, cheap action. */
export const generateOneSchema = z.object({
  ticketId: ticketIdSchema,
});

/**
 * A bounded chunk of documents. The chunk ceiling is enforced here so an
 * oversized request can never reach the renderer.
 */
export const generateManySchema = z.object({
  ticketIds: z.array(ticketIdSchema).min(1).max(GENERATION_CHUNK_MAX),
  confirmationText: z.literal(GENERATE_DOCUMENTS_CONFIRMATION_TEXT),
});

export type GenerateManyInput = z.infer<typeof generateManySchema>;

export const createBatchSchema = z.object({
  registrationIds: z.array(z.uuid()).min(1).max(EXPORT_BATCH_MAX_SIZE),
  purpose: z
    .enum(["initial", "updated", "replacement", "resend_preparation"])
    .default("initial"),
  confirmationText: z.literal(CREATE_BATCH_CONFIRMATION_TEXT),
});

export type CreateBatchRequest = z.infer<typeof createBatchSchema>;

export const cancelBatchSchema = z.object({
  batchId: batchIdSchema,
});
