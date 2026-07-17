import type { NextResponse } from "next/server";
import { hasImportAccess } from "@/features/imports/access";
import {
  disabledResponse,
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

/** Cancel an import that is still awaiting review. */
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

    const result = await cancelImport(parsedImportId.data);
    return serviceResponse(result);
  } catch {
    return internalErrorResponse();
  }
}
