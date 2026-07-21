import { NextResponse } from "next/server";

import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { buildSendQueueForBatch } from "@/features/distribution/service";
import { ticketJsonResponse } from "@/features/tickets/http";

/**
 * Streams the signed send-queue CSV for a delivery batch so an administrator
 * can load it into the Google Sheet the Apps Script sender reads. The CSV
 * carries no raw QR token, token hash or signing secret.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ batchId: string }> }
): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  const { batchId } = await context.params;
  try {
    const result = await buildSendQueueForBatch(batchId);
    if (!result.ok) {
      return ticketJsonResponse(
        { error: { code: result.code, message: result.message } },
        404
      );
    }
    return new NextResponse(result.data.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.data.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return ticketJsonResponse(
      { error: { code: "internal_error", message: "The export failed." } },
      500
    );
  }
}
