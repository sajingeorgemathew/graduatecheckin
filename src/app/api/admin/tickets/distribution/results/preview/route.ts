import { NextResponse } from "next/server";

import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { previewResultsSchema } from "@/features/distribution/schemas";
import { requireDistributionSecret } from "@/features/distribution/secret";
import { previewResults } from "@/features/distribution/service";
import { DistributionConfigurationError } from "@/features/distribution/signing";
import {
  consumeRateLimit,
  EXPORT_RATE_LIMIT,
} from "@/features/ticket-documents/rate-limit";
import {
  ticketInternalErrorResponse,
  ticketJsonResponse,
} from "@/features/tickets/http";

/** Previews an Apps Script results CSV without applying it. */
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
    consumeRateLimit(`distribution:results:${guard.session.userId}`, EXPORT_RATE_LIMIT)
  ) {
    return structuredError(
      429,
      "rate_limited",
      "Too many import requests. Wait a moment and try again."
    );
  }

  try {
    const body: unknown = await request.json();
    const parsed = previewResultsSchema.safeParse(body);
    if (!parsed.success) {
      return structuredError(
        422,
        "invalid_request",
        "Provide the delivery batch ID and the results CSV."
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

    const result = await previewResults({
      deliveryBatchId: parsed.data.deliveryBatchId,
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
