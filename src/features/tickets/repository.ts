import "server-only";

/**
 * Database access for the ticket feature. Uses the server-only service
 * role client. Errors are reported by operation name only so credential
 * and row values never leak. Raw tokens never pass through this module;
 * only token hashes reach the database functions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Database,
  GraduationEventRow,
  GraduationRegistrationRow,
  GraduationTicketRow,
  Json,
  TicketActivityLogRow,
  TicketGenerationBatchRow,
} from "@/types/database";
import type { RegistrationWithTickets } from "./types";

function db(): SupabaseClient<Database> {
  return getSupabaseAdminClient() as unknown as SupabaseClient<Database>;
}

function operationError(operation: string): Error {
  return new Error(`Ticket database operation failed: ${operation}`);
}

const REGISTRATION_WITH_TICKETS_SELECT =
  "id, event_id, graduate_full_name, source_registration_id, " +
  "registration_status, expected_party_size, registered_adult_guests, " +
  "registered_children_0_4, registered_children_5_10, is_test, " +
  "graduation_tickets (id, ticket_code, status, issued_at, created_at)";

interface RegistrationWithTicketsRaw
  extends Omit<RegistrationWithTickets, "tickets"> {
  graduation_tickets: RegistrationWithTickets["tickets"];
}

const FETCH_CHUNK_SIZE = 1000;

/**
 * Loads every registration of the event together with its tickets, in
 * chunks, so summary counts and list pages are always computed over the
 * complete event. Contact and payment columns are never selected.
 */
export async function fetchEventRegistrationsWithTickets(
  eventId: string
): Promise<RegistrationWithTickets[]> {
  const registrations: RegistrationWithTickets[] = [];
  for (let offset = 0; ; offset += FETCH_CHUNK_SIZE) {
    const { data, error } = await db()
      .from("graduation_registrations")
      .select(REGISTRATION_WITH_TICKETS_SELECT)
      .eq("event_id", eventId)
      .order("id", { ascending: true })
      .range(offset, offset + FETCH_CHUNK_SIZE - 1);
    if (error) {
      throw operationError("list event registrations");
    }
    const rows = (data ?? []) as unknown as RegistrationWithTicketsRaw[];
    for (const row of rows) {
      const { graduation_tickets, ...registration } = row;
      registrations.push({ ...registration, tickets: graduation_tickets });
    }
    if (rows.length < FETCH_CHUNK_SIZE) {
      break;
    }
  }
  return registrations;
}

export async function getTicketRow(
  ticketId: string
): Promise<GraduationTicketRow | null> {
  const { data, error } = await db()
    .from("graduation_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) {
    throw operationError("load ticket");
  }
  return data;
}

export interface TicketContext {
  ticket: GraduationTicketRow;
  registration: GraduationRegistrationRow;
  event: GraduationEventRow;
}

/** Loads a ticket with its registration and event, or null when missing. */
export async function getTicketContext(
  ticketId: string
): Promise<TicketContext | null> {
  const ticket = await getTicketRow(ticketId);
  if (ticket === null) {
    return null;
  }
  const { data: registration, error: registrationError } = await db()
    .from("graduation_registrations")
    .select("*")
    .eq("id", ticket.registration_id)
    .maybeSingle();
  if (registrationError) {
    throw operationError("load ticket registration");
  }
  if (registration === null) {
    return null;
  }
  const { data: event, error: eventError } = await db()
    .from("graduation_events")
    .select("*")
    .eq("id", registration.event_id)
    .maybeSingle();
  if (eventError) {
    throw operationError("load ticket event");
  }
  if (event === null) {
    return null;
  }
  return { ticket, registration, event };
}

export async function listTicketActivity(
  ticketId: string
): Promise<TicketActivityLogRow[]> {
  const { data, error } = await db()
    .from("ticket_activity_log")
    .select("*")
    .or(
      `ticket_id.eq.${ticketId},previous_ticket_id.eq.${ticketId},` +
        `replacement_ticket_id.eq.${ticketId}`
    )
    .order("created_at", { ascending: false });
  if (error) {
    throw operationError("list ticket activity");
  }
  return data ?? [];
}

/** Display names for staff user IDs. Emails are never returned. */
export async function getStaffDisplayNames(
  userIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) {
    return new Map();
  }
  const { data, error } = await db()
    .from("staff_profiles")
    .select("user_id, display_name")
    .in("user_id", unique);
  if (error) {
    throw operationError("load staff display names");
  }
  return new Map(
    (data ?? []).map((row) => [row.user_id, row.display_name] as const)
  );
}

export async function getGenerationBatch(
  batchId: string
): Promise<TicketGenerationBatchRow | null> {
  const { data, error } = await db()
    .from("ticket_generation_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (error) {
    throw operationError("load generation batch");
  }
  return data;
}

export interface BatchItemInput {
  ticket_id: string;
  registration_id: string;
  ticket_code: string;
  token_hash: string;
  token_version: number;
}

export async function applyTicketGenerationBatchRpc(
  actorUserId: string,
  eventId: string,
  idempotencyKey: string,
  requestId: string,
  items: BatchItemInput[]
): Promise<Json> {
  const { data, error } = await db().rpc("apply_ticket_generation_batch", {
    p_actor_user_id: actorUserId,
    p_event_id: eventId,
    p_idempotency_key: idempotencyKey,
    p_request_id: requestId,
    p_items: items as unknown as Json,
  });
  if (error) {
    throw operationError("apply ticket generation batch");
  }
  return data ?? null;
}

export async function replaceTicketRpc(
  actorUserId: string,
  ticketId: string,
  newTicketId: string,
  newTicketCode: string,
  newTokenHash: string,
  newTokenVersion: number,
  reason: string,
  requestId: string
): Promise<Json> {
  const { data, error } = await db().rpc("replace_graduation_ticket", {
    p_actor_user_id: actorUserId,
    p_ticket_id: ticketId,
    p_new_ticket_id: newTicketId,
    p_new_ticket_code: newTicketCode,
    p_new_token_hash: newTokenHash,
    p_new_token_version: newTokenVersion,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) {
    throw operationError("replace ticket");
  }
  return data ?? null;
}

export async function revokeTicketRpc(
  actorUserId: string,
  ticketId: string,
  reason: string,
  requestId: string
): Promise<Json> {
  const { data, error } = await db().rpc("revoke_graduation_ticket", {
    p_actor_user_id: actorUserId,
    p_ticket_id: ticketId,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) {
    throw operationError("revoke ticket");
  }
  return data ?? null;
}
