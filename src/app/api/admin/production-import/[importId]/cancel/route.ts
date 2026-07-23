import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
  internalErrorResponse,
  invalidRequestResponse,
  serviceResponse,
} from "@/features/production-import/http";
import { uuidSchema } from "@/features/production-import/schemas";
import { cancelProductionImport } from "@/features/production-import/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ importId: string }>;
}

/** Discard an import awaiting review. Administrator only. */
export async function POST(
  _request: Request,
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
    return serviceResponse(
      await cancelProductionImport(guard.session, parsedId.data)
    );
  } catch {
    return internalErrorResponse();
  }
}
