import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
  staffInternalErrorResponse,
  staffInvalidRequestResponse,
  staffServiceResponse,
} from "@/features/staff/http";
import { getStaffServiceDeps } from "@/features/staff/repository";
import { staffUserIdSchema } from "@/features/staff/schemas";
import { resetStaffTemporaryPassword } from "@/features/staff/service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

/**
 * Reset a staff member's temporary password. Administrator only. The new
 * temporary password appears once in this response and is never stored.
 */
export async function POST(
  _request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    const { userId } = await context.params;
    const parsedUserId = staffUserIdSchema.safeParse(userId);
    if (!parsedUserId.success) {
      return staffInvalidRequestResponse("The staff ID is invalid.");
    }

    const result = await resetStaffTemporaryPassword(
      getStaffServiceDeps(),
      guard.session,
      parsedUserId.data
    );
    return staffServiceResponse(result);
  } catch {
    return staffInternalErrorResponse();
  }
}
