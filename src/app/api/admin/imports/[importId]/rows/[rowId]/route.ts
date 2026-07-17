import type { NextResponse } from "next/server";
import { hasImportAccess } from "@/features/imports/access";
import {
  disabledResponse,
  internalErrorResponse,
  invalidRequestResponse,
  serviceResponse,
} from "@/features/imports/http";
import {
  importIdSchema,
  importRowIdSchema,
  rowInclusionSchema,
} from "@/features/imports/schemas";
import { setRowInclusion } from "@/features/imports/service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ importId: string; rowId: string }>;
}

/** Include or exclude one preview row. */
export async function PATCH(
  request: Request,
  context: RouteContext
): Promise<NextResponse> {
  if (!hasImportAccess()) {
    return disabledResponse();
  }

  try {
    const { importId, rowId } = await context.params;
    const parsedImportId = importIdSchema.safeParse(importId);
    const parsedRowId = importRowIdSchema.safeParse(rowId);
    if (!parsedImportId.success || !parsedRowId.success) {
      return invalidRequestResponse("The import or row ID is invalid.");
    }

    const body = rowInclusionSchema.safeParse(await request.json());
    if (!body.success) {
      return invalidRequestResponse("The include flag is required.");
    }

    const result = await setRowInclusion(
      parsedImportId.data,
      parsedRowId.data,
      body.data.include
    );
    return serviceResponse(result);
  } catch {
    return internalErrorResponse();
  }
}
