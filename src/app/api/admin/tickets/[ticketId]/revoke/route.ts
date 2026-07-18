import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
  ticketInternalErrorResponse,
  ticketServiceResponse,
} from "@/features/tickets/http";
import {
  getTicketRevocationDeps,
  revokeTicket,
} from "@/features/tickets/revocation";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ ticketId: string }>;
}

/**
 * Revoke one active ticket. Administrator only. No replacement is
 * generated. Returns status information only.
 */
export async function POST(
  request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    const { ticketId } = await context.params;
    const body: unknown = await request.json();
    const result = await revokeTicket(
      getTicketRevocationDeps(),
      guard.session,
      ticketId,
      body
    );
    return ticketServiceResponse(result);
  } catch {
    return ticketInternalErrorResponse();
  }
}
