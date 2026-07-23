import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { recordResend } from "@/features/manual-delivery/service";
import {
  internalErrorResponse,
  serviceResponse,
} from "@/features/production-import/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Record a resend of the same valid ticket. Administrator only. A reason is
 * required, a new append-only attempt is created and the ticket itself is
 * never invalidated.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    return serviceResponse(
      await recordResend(guard.session, await request.json())
    );
  } catch {
    return internalErrorResponse();
  }
}
