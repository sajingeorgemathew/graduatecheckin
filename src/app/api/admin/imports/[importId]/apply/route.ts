import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { applyImport } from "@/features/imports/apply";
import {
  internalErrorResponse,
  invalidRequestResponse,
  serviceResponse,
} from "@/features/imports/http";
import { importIdSchema } from "@/features/imports/schemas";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ importId: string }>;
}

/** Apply the approved rows of a reviewed import. Administrator only. */
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
    const parsedImportId = importIdSchema.safeParse(importId);
    if (!parsedImportId.success) {
      return invalidRequestResponse("The import ID is invalid.");
    }

    const result = await applyImport(
      guard.session,
      parsedImportId.data,
      await request.json()
    );
    return serviceResponse(result);
  } catch {
    return internalErrorResponse();
  }
}
