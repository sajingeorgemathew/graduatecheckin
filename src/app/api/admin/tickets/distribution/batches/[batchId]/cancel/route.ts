import { NextResponse } from "next/server";

import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { cancelDeliveryBatch } from "@/features/distribution/service";
import {
  ticketInternalErrorResponse,
  ticketJsonResponse,
} from "@/features/tickets/http";

/** Cancels an unsent (draft or prepared) delivery batch. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ batchId: string }> }
): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  const { batchId } = await context.params;
  try {
    const result = await cancelDeliveryBatch(guard.session.userId, batchId);
    if (!result.ok) {
      return ticketJsonResponse(
        { error: { code: result.code, message: result.message } },
        409
      );
    }
    return ticketJsonResponse(result.data, 200);
  } catch {
    return ticketInternalErrorResponse();
  }
}
