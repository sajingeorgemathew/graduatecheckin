/**
 * Request schemas for the distribution routes. Runtime-neutral; no secret
 * or database access. Every administrator action is validated here before
 * it reaches the service layer.
 */

import { z } from "zod";

import { DELIVERY_MODES, DELIVERY_PURPOSES } from "./constants";

const uuid = z.string().uuid();

/** Create a delivery batch from a completed PDF document batch. */
export const createDeliveryBatchSchema = z.object({
  documentBatchId: uuid,
  mode: z.enum(DELIVERY_MODES),
  purpose: z.enum(DELIVERY_PURPOSES).default("initial"),
  /**
   * When mode is test and the target event is a production event, an
   * administrator must explicitly opt into the internal test-recipient
   * override. It never sends to the graduate.
   */
  allowTestRecipientOverride: z.boolean().default(false),
});

export type CreateDeliveryBatchInput = z.infer<
  typeof createDeliveryBatchSchema
>;

/** Preview a results CSV without applying it. */
export const previewResultsSchema = z.object({
  deliveryBatchId: uuid,
  fileName: z.string().min(1).max(255),
  csv: z.string().min(1),
});

export type PreviewResultsInput = z.infer<typeof previewResultsSchema>;

/** Apply a previously uploaded results CSV. */
export const applyResultsSchema = z.object({
  deliveryBatchId: uuid,
  fileName: z.string().min(1).max(255),
  csv: z.string().min(1),
});

export type ApplyResultsInput = z.infer<typeof applyResultsSchema>;

export const cancelBatchSchema = z.object({
  deliveryBatchId: uuid,
});

export const resendPreparationSchema = z.object({
  deliveryBatchId: uuid,
  /** Delivery references to re-prepare, from failed or corrected records. */
  deliveryReferences: z.array(z.string().min(1)).min(1).max(50),
});
