import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
  getTicketGenerationDeps,
  runTicketGeneration,
} from "@/features/tickets/generation";
import {
  ticketInternalErrorResponse,
  ticketServiceResponse,
} from "@/features/tickets/http";

export const dynamic = "force-dynamic";

/**
 * Bulk ticket generation. Administrator only. Ticket IDs, codes and token
 * hashes are generated server-side; the response carries batch counts
 * only and never a raw token or token hash.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    const body: unknown = await request.json();
    const result = await runTicketGeneration(
      getTicketGenerationDeps(),
      guard.session,
      body
    );
    return ticketServiceResponse(result);
  } catch {
    return ticketInternalErrorResponse();
  }
}
