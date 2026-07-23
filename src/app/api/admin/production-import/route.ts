import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
  internalErrorResponse,
  invalidRequestResponse,
  serviceResponse,
} from "@/features/production-import/http";
import { uploadAndReconcile } from "@/features/production-import/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Upload the RSVP workbook and build the reconciliation preview.
 * Administrator only; the guard revalidates the session on every request.
 * The workbook is parsed in memory and is never stored.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return invalidRequestResponse("An .xlsx workbook upload is required.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadAndReconcile(guard.session, {
      filename: file.name,
      sizeBytes: buffer.byteLength,
      buffer,
    });
    return serviceResponse(result);
  } catch {
    return internalErrorResponse();
  }
}
