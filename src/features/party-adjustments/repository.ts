import "server-only";

/**
 * Database access for administrator party adjustments. Uses the server-only
 * service-role client because every table involved has RLS enabled with no
 * policies. Errors are reported by operation name only, so a database message
 * can never echo a graduate's details into a log.
 *
 * This module reads the active ticket and the current PDF for display only.
 * It never writes graduation_tickets: the ticket, its code and its QR are
 * preserved by never being touched here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Database,
  GraduationRegistrationRow,
  GraduationTicketDocumentRow,
  GraduationTicketRow,
  Json,
} from "@/types/database";

function db(): SupabaseClient<Database> {
  return getSupabaseAdminClient() as unknown as SupabaseClient<Database>;
}

function operationError(operation: string): Error {
  return new Error(`Party adjustment database operation failed: ${operation}`);
}

export async function getRegistration(
  registrationId: string
): Promise<GraduationRegistrationRow | null> {
  const { data, error } = await db()
    .from("graduation_registrations")
    .select("*")
    .eq("id", registrationId)
    .maybeSingle();
  if (error) {
    throw operationError("load registration");
  }
  return data;
}

export async function getActiveTicketForRegistration(
  registrationId: string
): Promise<GraduationTicketRow | null> {
  const { data, error } = await db()
    .from("graduation_tickets")
    .select("*")
    .eq("registration_id", registrationId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    throw operationError("load active ticket");
  }
  return data;
}

export async function getCurrentDocumentForTicket(
  ticketId: string
): Promise<GraduationTicketDocumentRow | null> {
  const { data, error } = await db()
    .from("graduation_ticket_documents")
    .select("*")
    .eq("ticket_id", ticketId)
    .eq("status", "current")
    .maybeSingle();
  if (error) {
    throw operationError("load current document");
  }
  return data;
}

export interface UpdatePartyArgs {
  actorUserId: string;
  registrationId: string;
  adultGuestCount: number;
  adultGuestNames: string[];
  children04: number;
  children510: number;
  reason: string;
  paymentNote: string | null;
  idempotencyKey: string;
  expectedUpdatedAt: string | null;
}

/**
 * Calls the atomic party-adjustment RPC. The actor and every value are
 * validated inside the security-definer function; this wrapper only forwards
 * them and surfaces the JSON result.
 */
export async function updateRegistrationPartyRpc(
  args: UpdatePartyArgs
): Promise<Json> {
  const { data, error } = await db().rpc(
    "update_graduation_registration_party",
    {
      p_actor_user_id: args.actorUserId,
      p_registration_id: args.registrationId,
      p_adult_guest_count: args.adultGuestCount,
      p_adult_guest_names: args.adultGuestNames as unknown as Json,
      p_children_0_4: args.children04,
      p_children_5_10: args.children510,
      p_reason: args.reason,
      p_payment_note: args.paymentNote,
      p_idempotency_key: args.idempotencyKey,
      p_expected_updated_at: args.expectedUpdatedAt,
    }
  );
  if (error) {
    throw operationError("update registration party");
  }
  return data ?? null;
}
