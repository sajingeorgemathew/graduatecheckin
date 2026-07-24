import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { adjustRegistrationParty } from "@/features/party-adjustments/service";
import {
  internalErrorResponse,
  serviceResponse,
} from "@/features/production-import/http";

/**
 * Adjust a graduate's registered party while preserving the same ticket and
 * QR. Administrator only. Runs on the Node.js runtime because a successful
 * adjustment regenerates the PDF, which needs Node APIs.
 *
 * The actor and the active event are resolved server-side; neither an actor
 * ID nor an event ID is ever accepted from the browser.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    return serviceResponse(
      await adjustRegistrationParty(guard.session, await request.json())
    );
  } catch {
    return internalErrorResponse();
  }
}
