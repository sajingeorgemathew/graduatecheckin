/**
 * Pure validation helpers for the scanner service: manual-code
 * normalization and ticket and registration status evaluation. All
 * decisions here run server-side; the browser never decides whether a
 * ticket is valid.
 */

import { isValidTicketCode } from "@/features/tickets/ticket-code";
import type { RegistrationStatus, TicketStatus } from "@/types/database";

/** Uppercases and trims a manually typed ticket code. */
export function normalizeManualCode(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * True only for a complete, exactly formatted ticket code. Partial values
 * are rejected before any database lookup so partial matching can never
 * happen.
 */
export function isCompleteTicketCode(value: string): boolean {
  return isValidTicketCode(value);
}

export type TicketStatusEvaluation =
  | { kind: "continue" }
  | { kind: "revoked" }
  | { kind: "replaced" }
  | { kind: "pending" };

export function evaluateTicketStatus(
  status: TicketStatus
): TicketStatusEvaluation {
  switch (status) {
    case "active":
      return { kind: "continue" };
    case "revoked":
      return { kind: "revoked" };
    case "replaced":
      return { kind: "replaced" };
    case "pending":
      return { kind: "pending" };
  }
}

export type RegistrationStatusEvaluation =
  | { kind: "continue" }
  | { kind: "blocked" };

export function evaluateRegistrationStatus(
  status: RegistrationStatus
): RegistrationStatusEvaluation {
  if (status === "eligible") {
    return { kind: "continue" };
  }
  return { kind: "blocked" };
}
