import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
  internalErrorResponse,
  invalidRequestResponse,
  serviceResponse,
} from "@/features/production-import/http";
import { uuidSchema } from "@/features/production-import/schemas";
import { createRegistrationFromCandidate } from "@/features/roster/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ candidateId: string }>;
}

/**
 * Create a production registration from one roster candidate.
 * Administrator only. The roster itself is never turned into registrations
 * in bulk: each graduate is an explicit decision.
 */
export async function POST(
  request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    const { candidateId } = await context.params;
    const parsedId = uuidSchema.safeParse(candidateId);
    if (!parsedId.success) {
      return invalidRequestResponse("The roster candidate ID is invalid.");
    }

    let overrideReason: string | null = null;
    try {
      const body: unknown = await request.json();
      if (
        body !== null &&
        typeof body === "object" &&
        "overrideReason" in body &&
        typeof (body as { overrideReason: unknown }).overrideReason === "string"
      ) {
        const value = (body as { overrideReason: string }).overrideReason.trim();
        overrideReason = value.length === 0 ? null : value;
      }
    } catch {
      overrideReason = null;
    }

    return serviceResponse(
      await createRegistrationFromCandidate(
        guard.session,
        parsedId.data,
        overrideReason
      )
    );
  } catch {
    return internalErrorResponse();
  }
}
