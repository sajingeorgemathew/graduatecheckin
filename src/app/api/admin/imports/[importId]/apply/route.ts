import type { NextResponse } from "next/server";
import { hasImportAccess } from "@/features/imports/access";
import { applyImport } from "@/features/imports/apply";
import {
  disabledResponse,
  internalErrorResponse,
  invalidRequestResponse,
  serviceResponse,
} from "@/features/imports/http";
import { importIdSchema } from "@/features/imports/schemas";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ importId: string }>;
}

/** Apply the approved rows of a reviewed import. */
export async function POST(
  request: Request,
  context: RouteContext
): Promise<NextResponse> {
  if (!hasImportAccess()) {
    return disabledResponse();
  }

  try {
    const { importId } = await context.params;
    const parsedImportId = importIdSchema.safeParse(importId);
    if (!parsedImportId.success) {
      return invalidRequestResponse("The import ID is invalid.");
    }

    const result = await applyImport(parsedImportId.data, await request.json());
    return serviceResponse(result);
  } catch {
    return internalErrorResponse();
  }
}
