import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { generateMissingTickets } from "@/features/manual-delivery/generation";
import {
  internalErrorResponse,
  serviceResponse,
} from "@/features/production-import/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Generate every missing ticket and every missing PDF for the active
 * event. Administrator only. Only fills gaps: an existing valid ticket and
 * an existing current PDF are both left untouched.
 */
export async function POST(): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    return serviceResponse(await generateMissingTickets(guard.session));
  } catch {
    return internalErrorResponse();
  }
}
