import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
  internalErrorResponse,
  invalidRequestResponse,
  serviceResponse,
} from "@/features/production-import/http";
import {
  reconcileGraduateSchema,
  uuidSchema,
} from "@/features/production-import/schemas";
import { reconcileGraduate } from "@/features/production-import/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ importId: string; graduateId: string }>;
}

/**
 * Record the administrator's reconciliation decision for one graduate:
 * approved counts, corrected details, an exclusion or a note.
 * Administrator only.
 */
export async function PATCH(
  request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    const { importId, graduateId } = await context.params;
    const parsedImportId = uuidSchema.safeParse(importId);
    const parsedGraduateId = uuidSchema.safeParse(graduateId);
    if (!parsedImportId.success || !parsedGraduateId.success) {
      return invalidRequestResponse("The import or graduate ID is invalid.");
    }

    const parsedBody = reconcileGraduateSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return invalidRequestResponse(
        "Check the approved guest and child counts. At most two adult " +
          "guests and two children in total are permitted."
      );
    }

    return serviceResponse(
      await reconcileGraduate(
        guard.session,
        parsedImportId.data,
        parsedGraduateId.data,
        parsedBody.data
      )
    );
  } catch {
    return internalErrorResponse();
  }
}
