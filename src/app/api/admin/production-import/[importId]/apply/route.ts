import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { applyProductionImport } from "@/features/production-import/apply";
import {
  internalErrorResponse,
  invalidRequestResponse,
  serviceResponse,
} from "@/features/production-import/http";
import { uuidSchema } from "@/features/production-import/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ importId: string }>;
}

/**
 * Apply a reviewed production import. Administrator only. Creates at most
 * one registration per reconciled graduate and never creates a ticket.
 */
export async function POST(
  request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    const { importId } = await context.params;
    const parsedId = uuidSchema.safeParse(importId);
    if (!parsedId.success) {
      return invalidRequestResponse("The import ID is invalid.");
    }

    const result = await applyProductionImport(
      guard.session,
      parsedId.data,
      await request.json()
    );
    return serviceResponse(result);
  } catch {
    return internalErrorResponse();
  }
}
