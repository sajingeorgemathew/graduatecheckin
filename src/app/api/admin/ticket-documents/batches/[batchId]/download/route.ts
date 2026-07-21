import { NextResponse } from "next/server";

import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { buildBatchZip } from "@/features/ticket-documents/batches";
import {
  consumeRateLimit,
  EXPORT_RATE_LIMIT,
} from "@/features/ticket-documents/rate-limit";
import { batchIdSchema } from "@/features/ticket-documents/schemas";
import {
  ticketInternalErrorResponse,
  ticketJsonResponse,
} from "@/features/tickets/http";

/**
 * Authenticated ZIP download for a completed batch.
 *
 * The archive is built on demand from the immutable batch snapshot and the
 * private PDF objects, so it is never stored and the same batch always
 * reproduces the same logical contents.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ batchId: string }>;
}

function structuredError(
  status: number,
  code: string,
  message: string
): NextResponse {
  return ticketJsonResponse({ error: { code, message } }, status);
}

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  if (
    consumeRateLimit(`batch-zip:${guard.session.userId}`, EXPORT_RATE_LIMIT)
  ) {
    return structuredError(
      429,
      "rate_limited",
      "Too many export downloads. Wait a moment and try again."
    );
  }

  try {
    const { batchId } = await context.params;
    const parsed = batchIdSchema.safeParse(batchId);
    if (!parsed.success) {
      return structuredError(
        422,
        "invalid_batch_id",
        "The batch ID is invalid."
      );
    }

    const archive = await buildBatchZip(parsed.data, guard.session.role);
    if (archive === null) {
      return structuredError(404, "batch_not_found", "The batch was not found.");
    }

    return new NextResponse(new Uint8Array(archive.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(archive.bytes.length),
        "Content-Disposition": `attachment; filename="${archive.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return ticketInternalErrorResponse();
  }
}
