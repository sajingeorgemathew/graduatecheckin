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
import { changeStaffRole } from "@/features/staff/service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

/** Change a staff member's role. Administrator only. */
export async function PATCH(
  request: Request,
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

    const body: unknown = await request.json();
    const result = await changeStaffRole(
      getStaffServiceDeps(),
      guard.session,
      parsedUserId.data,
      body
    );
    return staffServiceResponse(result);
  } catch {
    return staffInternalErrorResponse();
  }
}
