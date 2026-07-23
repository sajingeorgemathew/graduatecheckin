import { NextResponse } from "next/server";

import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { resolveModeGate } from "@/features/distribution/deployment";
import { requireDistributionSecret } from "@/features/distribution/secret";
import { createDeliveryBatchSchema } from "@/features/distribution/schemas";
import { prepareDeliveryBatch } from "@/features/distribution/service";
import { DistributionConfigurationError } from "@/features/distribution/signing";
import {
  consumeRateLimit,
  EXPORT_RATE_LIMIT,
} from "@/features/ticket-documents/rate-limit";
import {
  ticketInternalErrorResponse,
  ticketJsonResponse,
} from "@/features/tickets/http";

/**
 * Prepares a delivery batch from a completed PDF document batch. The
 * application never sends email; it only prepares and records deliveries.
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
    consumeRateLimit(`distribution:prepare:${guard.session.userId}`, EXPORT_RATE_LIMIT)
  ) {
    return structuredError(
      429,
      "rate_limited",
      "Too many preparation requests. Wait a moment and try again."
    );
  }

  try {
    const body: unknown = await request.json();
    const parsed = createDeliveryBatchSchema.safeParse(body);
    if (!parsed.success) {
      return structuredError(
        422,
        "invalid_request",
        "Provide a document batch ID, a mode and a purpose."
      );
    }

    // CHECKIN-10A: production preparation exists only on the production
    // deployment with the production event active. Local development and
    // Vercel Preview are refused here, before anything is prepared.
    const gate = await resolveModeGate(parsed.data.mode);
    if (!gate.allowed) {
      return structuredError(403, gate.code, gate.message);
    }

    // A resend or replacement batch must carry an administrator reason so the
    // attempt stays auditable and a replacement is never silent.
    if (
      (parsed.data.purpose === "resend" ||
        parsed.data.purpose === "replacement") &&
      parsed.data.purposeReason.trim().length === 0
    ) {
      return structuredError(
        422,
        "reason_required",
        "A resend or replacement batch requires a recorded reason."
      );
    }

    let secret: string;
    try {
      secret = requireDistributionSecret();
    } catch (error) {
      if (error instanceof DistributionConfigurationError) {
        return structuredError(
          503,
          "distribution_not_configured",
          "TICKET_DISTRIBUTION_SECRET is not configured."
        );
      }
      throw error;
    }

    const result = await prepareDeliveryBatch({
      actorUserId: guard.session.userId,
      documentBatchId: parsed.data.documentBatchId,
      mode: parsed.data.mode,
      purpose: parsed.data.purpose,
      purposeReason: parsed.data.purposeReason,
      allowTestRecipientOverride: parsed.data.allowTestRecipientOverride,
      secret,
    });

    if (!result.ok) {
      return structuredError(409, result.code, result.message);
    }
    return ticketJsonResponse(result.data, 200);
  } catch {
    return ticketInternalErrorResponse();
  }
}
