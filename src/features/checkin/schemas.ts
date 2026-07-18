/**
 * Zod schemas for check-in inputs. The confirmation route parses its JSON
 * body with these before any database work. The schema is strict so the
 * browser can never smuggle an event, ticket, registration or actor id
 * into the request: any unexpected key fails validation. The trusted
 * validation-attempt id alone resolves the registration on the server.
 */

import { z } from "zod";
import { MAX_ARRIVING_PER_CATEGORY, MAX_GRADUATE_ARRIVING } from "./constants";

const countSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_ARRIVING_PER_CATEGORY);

export const confirmCheckinSchema = z
  .object({
    validationAttemptId: z.uuid(),
    requestId: z.uuid(),
    graduateArriving: z.number().int().min(0).max(MAX_GRADUATE_ARRIVING),
    adultGuestsArriving: countSchema,
    children0To4Arriving: countSchema,
    children5To10Arriving: countSchema,
  })
  .strict();

export type ConfirmCheckinSchema = z.infer<typeof confirmCheckinSchema>;
