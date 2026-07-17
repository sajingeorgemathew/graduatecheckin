import type { NextResponse } from "next/server";
import { hasImportAccess } from "@/features/imports/access";
import {
  disabledResponse,
  internalErrorResponse,
  invalidRequestResponse,
  serviceResponse,
} from "@/features/imports/http";
import { uploadAndPreview } from "@/features/imports/service";

export const dynamic = "force-dynamic";

/** Upload a registration workbook and create a reviewable preview. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!hasImportAccess()) {
    return disabledResponse();
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return invalidRequestResponse("An .xlsx file upload is required.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadAndPreview({
      filename: file.name,
      sizeBytes: buffer.byteLength,
      buffer,
    });
    return serviceResponse(result);
  } catch {
    return internalErrorResponse();
  }
}
