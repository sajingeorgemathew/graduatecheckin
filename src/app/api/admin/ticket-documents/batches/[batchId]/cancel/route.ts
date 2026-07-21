import { NextResponse } from "next/server";

import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { cancelExportBatch } from "@/features/ticket-documents/batches";
import { batchIdSchema } from "@/features/ticket-documents/schemas";
import {
  ticketInternalErrorResponse,
  ticketJsonResponse,
} from "@/features/tickets/http";

/**
 * Cancels a batch that has not been exported. An exported batch stays
 * immutable so its manifest and PDFs remain auditable.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ batchId: string }>;
}

export async function POST(
  _request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    const { batchId } = await context.params;
    const parsed = batchIdSchema.safeParse(batchId);
    if (!parsed.success) {
      return ticketJsonResponse(
        { error: { code: "invalid_batch_id", message: "The batch ID is invalid." } },
        422
      );
    }

    const cancelled = await cancelExportBatch(parsed.data);
    if (!cancelled) {
      return ticketJsonResponse(
        {
          error: {
            code: "batch_not_cancellable",
            message: "An exported or missing batch cannot be cancelled.",
          },
        },
        409
      );
    }

    return ticketJsonResponse({ cancelled: true }, 200);
  } catch {
    return ticketInternalErrorResponse();
  }
}
