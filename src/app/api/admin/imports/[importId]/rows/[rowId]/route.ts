import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
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

/** Include or exclude one preview row. Administrator only. */
export async function PATCH(
  request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
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
      guard.session,
      parsedImportId.data,
      parsedRowId.data,
      body.data.include
    );
    return serviceResponse(result);
  } catch {
    return internalErrorResponse();
  }
}
