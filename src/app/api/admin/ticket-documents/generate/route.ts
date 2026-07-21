import { NextResponse } from "next/server";

import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
  consumeRateLimit,
  GENERATION_RATE_LIMIT,
} from "@/features/ticket-documents/rate-limit";
import {
  generateManySchema,
  generateOneSchema,
} from "@/features/ticket-documents/schemas";
import { generateTicketDocuments } from "@/features/ticket-documents/service";
import {
  ticketInternalErrorResponse,
  ticketJsonResponse,
} from "@/features/tickets/http";

/**
 * Generates one PDF or a bounded chunk of PDFs.
 *
 * Administrator only. Runs on the Node.js runtime because PDF rendering
 * needs Node APIs. Never generates on page load: generation only ever
 * happens through this explicit POST.
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
    consumeRateLimit(`generate:${guard.session.userId}`, GENERATION_RATE_LIMIT)
  ) {
    return structuredError(
      429,
      "rate_limited",
      "Too many generation requests. Wait a moment and try again."
    );
  }

  try {
    const body: unknown = await request.json();

    // A single ticket needs no confirmation; a bulk chunk does.
    const single = generateOneSchema.safeParse(body);
    const many = generateManySchema.safeParse(body);

    let ticketIds: string[];
    if (single.success) {
      ticketIds = [single.data.ticketId];
    } else if (many.success) {
      ticketIds = many.data.ticketIds;
    } else {
      return structuredError(
        422,
        "invalid_request",
        "Provide a ticketId, or ticketIds with the confirmation text."
      );
    }

    const results = await generateTicketDocuments(
      guard.session.userId,
      ticketIds
    );
    const generatedCount = results.filter((result) => result.ok).length;

    return ticketJsonResponse(
      {
        requestedCount: ticketIds.length,
        generatedCount,
        failedCount: results.length - generatedCount,
        results,
      },
      200
    );
  } catch {
    return ticketInternalErrorResponse();
  }
}
