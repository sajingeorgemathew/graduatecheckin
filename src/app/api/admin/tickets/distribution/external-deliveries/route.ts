import { NextResponse } from "next/server";

import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { externalDeliverySchema } from "@/features/distribution/schemas";
import { recordExternalDelivery } from "@/features/distribution/production-service";
import {
  consumeRateLimit,
  EXPORT_RATE_LIMIT,
} from "@/features/ticket-documents/rate-limit";
import {
  ticketInternalErrorResponse,
  ticketJsonResponse,
} from "@/features/tickets/http";

/**
 * Records that a graduate already received their ticket outside this system.
 *
 * This route sends no email, creates no delivery, creates no send attempt and
 * never contacts Google Apps Script. It writes one audit record whose only
 * operational effect is to remove the graduate from initial-batch eligibility
 * while leaving an intentional resend available. Administrator only:
 * supervisors and scanners are rejected before anything is read or written.
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

  if (
    consumeRateLimit(
      `distribution:external:${guard.session.userId}`,
      EXPORT_RATE_LIMIT
    )
  ) {
    return structuredError(
      429,
      "rate_limited",
      "Too many requests. Wait a moment and try again."
    );
  }

  try {
    const body: unknown = await request.json();
    const parsed = externalDeliverySchema.safeParse(body);
    if (!parsed.success) {
      return structuredError(
        422,
        "invalid_request",
        "Provide a registration, a previous send date and a channel."
      );
    }

    const result = await recordExternalDelivery({
      actorUserId: guard.session.userId,
      registrationId: parsed.data.registrationId,
      documentReference: parsed.data.documentReference,
      previousSendDate: parsed.data.previousSendDate,
      channel: parsed.data.channel,
      note: parsed.data.note,
    });
    if (!result.ok) {
      return structuredError(409, result.code, result.message);
    }
    return ticketJsonResponse(result.data, 200);
  } catch {
    return ticketInternalErrorResponse();
  }
}
