import { NextResponse } from "next/server";

import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { applyResultsSchema } from "@/features/distribution/schemas";
import { requireDistributionSecret } from "@/features/distribution/secret";
import { applyResults } from "@/features/distribution/service";
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
 * Applies an Apps Script results CSV, appending immutable attempt history.
 * A repeated import of the same file is idempotent.
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
    consumeRateLimit(`distribution:apply:${guard.session.userId}`, EXPORT_RATE_LIMIT)
  ) {
    return structuredError(
      429,
      "rate_limited",
      "Too many import requests. Wait a moment and try again."
    );
  }

  try {
    const body: unknown = await request.json();
    const parsed = applyResultsSchema.safeParse(body);
    if (!parsed.success) {
      return structuredError(
        422,
        "invalid_request",
        "Provide the delivery batch ID, file name and results CSV."
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

    const result = await applyResults({
      actorUserId: guard.session.userId,
      deliveryBatchId: parsed.data.deliveryBatchId,
      fileName: parsed.data.fileName,
      csv: parsed.data.csv,
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
