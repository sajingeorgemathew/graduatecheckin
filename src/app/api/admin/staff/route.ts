import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
  staffInternalErrorResponse,
  staffServiceResponse,
} from "@/features/staff/http";
import { getStaffServiceDeps } from "@/features/staff/repository";
import { createStaffAccount } from "@/features/staff/service";

export const dynamic = "force-dynamic";

/**
 * Create a staff account. Administrator only. The response contains the
 * temporary password exactly once; it is never stored or logged.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    const body: unknown = await request.json();
    const result = await createStaffAccount(
      getStaffServiceDeps(),
      guard.session,
      body
    );
    return staffServiceResponse(result);
  } catch {
    return staffInternalErrorResponse();
  }
}
