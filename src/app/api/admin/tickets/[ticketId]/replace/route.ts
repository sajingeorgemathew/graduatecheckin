import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { invalidateDocumentsForTicket } from "@/features/ticket-documents/service";
import {
  ticketInternalErrorResponse,
  ticketServiceResponse,
} from "@/features/tickets/http";
import {
  getTicketReplacementDeps,
  replaceTicket,
} from "@/features/tickets/replacement";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ ticketId: string }>;
}

/**
 * Replace one active ticket. Administrator only. The response carries the
 * new ticket ID and code only; the new raw token is never returned.
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
    const result = await replaceTicket(
      getTicketReplacementDeps(),
      guard.session,
      ticketId,
      body
    );

    // CHECKIN-09A: the replaced ticket keeps its document history, but
    // those PDFs are no longer admissible and must not enter an export
    // batch. The new ticket gets its own PDF when an administrator
    // generates one. This never alters the replacement result, the ticket
    // rows or any attendance record.
    if (result.ok) {
      await invalidateDocumentsForTicket(
        guard.session.userId,
        ticketId,
        "replaced"
      );
    }

    return ticketServiceResponse(result);
  } catch {
    return ticketInternalErrorResponse();
  }
}
