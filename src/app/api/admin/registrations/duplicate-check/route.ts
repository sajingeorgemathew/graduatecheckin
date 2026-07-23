import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
  internalErrorResponse,
  serviceResponse,
} from "@/features/production-import/http";
import { checkForDuplicates } from "@/features/registrations/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Report likely duplicates for a graduate the administrator is about to
 * add. Administrator only. Reads only; nothing is created here.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    return serviceResponse(
      await checkForDuplicates(guard.session, await request.json())
    );
  } catch {
    return internalErrorResponse();
  }
}
