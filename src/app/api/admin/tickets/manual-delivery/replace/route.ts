import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { replaceTicketForDelivery } from "@/features/manual-delivery/service";
import {
  internalErrorResponse,
  serviceResponse,
} from "@/features/production-import/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Replace a graduate's ticket. Administrator only. A reason is required, a
 * new ticket and PDF version are issued, the previous ticket stays
 * traceable and its QR code can never validate again.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    return serviceResponse(
      await replaceTicketForDelivery(guard.session, await request.json())
    );
  } catch {
    return internalErrorResponse();
  }
}
