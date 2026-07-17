import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
  internalErrorResponse,
  invalidRequestResponse,
  serviceResponse,
} from "@/features/imports/http";
import { importIdSchema } from "@/features/imports/schemas";
import { cancelImport } from "@/features/imports/service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ importId: string }>;
}

/** Cancel an import that is still awaiting review. Administrator only. */
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
    const parsedImportId = importIdSchema.safeParse(importId);
    if (!parsedImportId.success) {
      return invalidRequestResponse("The import ID is invalid.");
    }

    const result = await cancelImport(guard.session, parsedImportId.data);
    return serviceResponse(result);
  } catch {
    return internalErrorResponse();
  }
}
