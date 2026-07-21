import { NextResponse } from "next/server";

import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import { createExportBatch } from "@/features/ticket-documents/batches";
import {
  consumeRateLimit,
  EXPORT_RATE_LIMIT,
} from "@/features/ticket-documents/rate-limit";
import { createBatchSchema } from "@/features/ticket-documents/schemas";
import {
  ticketInternalErrorResponse,
  ticketJsonResponse,
} from "@/features/tickets/http";

/**
 * Creates an immutable export batch from the current documents of the
 * selected registrations. Preparation only: CHECKIN-09A never sends the
 * batch and never contacts an email provider.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function structuredError(
  status: number,
  code: string,
  message: string
): NextResponse {
  return ticketJsonResponse({ error: { code, message } }, status);
}

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  if (consumeRateLimit(`batch:${guard.session.userId}`, EXPORT_RATE_LIMIT)) {
    return structuredError(
      429,
      "rate_limited",
      "Too many export requests. Wait a moment and try again."
    );
  }

  try {
    const body: unknown = await request.json();
    const parsed = createBatchSchema.safeParse(body);
    if (!parsed.success) {
      return structuredError(
        422,
        "invalid_request",
        "Provide up to 50 registration IDs and the confirmation text."
      );
    }

    const event = await resolveActiveEvent();
    if (!event.ok) {
      return structuredError(
        409,
        event.code,
        "The configured graduation event is not available."
      );
    }

    const result = await createExportBatch({
      actorUserId: guard.session.userId,
      eventId: event.event.id,
      registrationIds: parsed.data.registrationIds,
      purpose: parsed.data.purpose,
    });

    if (!result.ok) {
      return structuredError(409, result.code, result.message);
    }

    return ticketJsonResponse(result, 200);
  } catch {
    return ticketInternalErrorResponse();
  }
}
