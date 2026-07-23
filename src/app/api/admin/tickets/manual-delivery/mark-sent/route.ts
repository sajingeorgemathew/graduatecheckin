import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { markManuallySent } from "@/features/manual-delivery/service";
import {
  internalErrorResponse,
  serviceResponse,
} from "@/features/production-import/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Record that the administrator has already sent this graduate's ticket by
 * hand through Gmail. Administrator only. This route sends no email: it is
 * the only place the application ever claims a ticket was delivered, and it
 * runs only because a human confirmed it.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    return serviceResponse(
      await markManuallySent(guard.session, await request.json())
    );
  } catch {
    return internalErrorResponse();
  }
}
