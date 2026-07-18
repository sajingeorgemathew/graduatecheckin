import "server-only";

/**
 * Database access for the check-in feature. Uses the server-only service
 * role client. Errors are reported by operation name only so credential
 * and row values never leak. Raw tokens and QR payloads never pass through
 * this module.
 *
 * All attendance logic lives in the atomic apply_graduation_checkin
 * database function. This module only forwards the trusted server-resolved
 * arguments and returns the safe jsonb result.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";

function db(): SupabaseClient<Database> {
  return getSupabaseAdminClient() as unknown as SupabaseClient<Database>;
}

function operationError(operation: string): Error {
  return new Error(`Check-in database operation failed: ${operation}`);
}

export interface ApplyCheckinArgs {
  actorUserId: string;
  eventId: string;
  validationAttemptId: string;
  requestId: string;
  graduateArriving: number;
  adultGuestsArriving: number;
  children0To4Arriving: number;
  children5To10Arriving: number;
}

/**
 * Calls the atomic arrival-confirmation function. The function locks the
 * validation attempt, event, ticket and registration, enforces allowances
 * inside the transaction and returns safe attendance totals only.
 */
export async function applyGraduationCheckinRpc(
  args: ApplyCheckinArgs
): Promise<Json> {
  const { data, error } = await db().rpc("apply_graduation_checkin", {
    p_actor_user_id: args.actorUserId,
    p_event_id: args.eventId,
    p_validation_attempt_id: args.validationAttemptId,
    p_request_id: args.requestId,
    p_graduate_arriving: args.graduateArriving,
    p_adult_guests_arriving: args.adultGuestsArriving,
    p_children_0_4_arriving: args.children0To4Arriving,
    p_children_5_10_arriving: args.children5To10Arriving,
  });
  if (error) {
    throw operationError("apply graduation check-in");
  }
  return data ?? null;
}
