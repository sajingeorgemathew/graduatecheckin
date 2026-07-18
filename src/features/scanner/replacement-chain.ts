/**
 * Replacement-chain resolution. When staff scan an old replaced ticket,
 * the scanner follows replaced_by_ticket_id to the newest ticket so it
 * can tell the graduate which ticket to present. Resolution never
 * reactivates the old ticket and only the latest ticket code and status
 * are exposed; raw tokens and token hashes are never returned.
 */

import type { TicketStatus } from "@/types/database";
import { REPLACEMENT_CHAIN_MAX_DEPTH } from "./constants";

export interface ReplacementChainTicket {
  id: string;
  registration_id: string;
  ticket_code: string;
  status: TicketStatus;
  replaced_by_ticket_id: string | null;
}

export type ReplacementChainResolution =
  | { ok: true; latestTicketCode: string; latestStatus: TicketStatus }
  | { ok: false; reason: "missing" | "cycle" | "depth_exceeded" | "foreign" };

/**
 * Follows the chain from a replaced ticket to the newest ticket. Detects
 * cycles, limits traversal depth and rejects chains that ever leave the
 * scanned ticket's registration.
 */
export async function resolveReplacementChain(
  start: ReplacementChainTicket,
  getTicket: (ticketId: string) => Promise<ReplacementChainTicket | null>,
  maxDepth: number = REPLACEMENT_CHAIN_MAX_DEPTH
): Promise<ReplacementChainResolution> {
  const visited = new Set<string>([start.id]);
  let current = start;
  for (let depth = 0; current.replaced_by_ticket_id !== null; depth += 1) {
    if (depth >= maxDepth) {
      return { ok: false, reason: "depth_exceeded" };
    }
    const nextId = current.replaced_by_ticket_id;
    if (visited.has(nextId)) {
      return { ok: false, reason: "cycle" };
    }
    const next = await getTicket(nextId);
    if (next === null) {
      return { ok: false, reason: "missing" };
    }
    if (next.registration_id !== start.registration_id) {
      return { ok: false, reason: "foreign" };
    }
    visited.add(next.id);
    current = next;
  }
  if (current.id === start.id) {
    return { ok: false, reason: "missing" };
  }
  return {
    ok: true,
    latestTicketCode: current.ticket_code,
    latestStatus: current.status,
  };
}
