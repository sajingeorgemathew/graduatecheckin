import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
  internalErrorResponse,
  serviceResponse,
} from "@/features/production-import/http";
import { createManualRegistration } from "@/features/registrations/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Manually add a graduate: a late RSVP, a missing RSVP, an
 * administrator-added graduate or a walk-in. Administrator only. Likely
 * duplicates are reported and can be overridden with a recorded reason.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    return serviceResponse(
      await createManualRegistration(guard.session, await request.json())
    );
  } catch {
    return internalErrorResponse();
  }
}
