import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
  internalErrorResponse,
  invalidRequestResponse,
  serviceResponse,
} from "@/features/imports/http";
import { uploadAndPreview } from "@/features/imports/service";

export const dynamic = "force-dynamic";

/**
 * Upload a registration workbook and create a reviewable preview.
 * Administrator only; the guard revalidates the session on every request.
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
      return invalidRequestResponse("An .xlsx file upload is required.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadAndPreview(guard.session, {
      filename: file.name,
      sizeBytes: buffer.byteLength,
      buffer,
    });
    return serviceResponse(result);
  } catch {
    return internalErrorResponse();
  }
}
