import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireScanner } from "@/features/auth/guards";
import {
  scannerInternalErrorResponse,
  scannerInvalidRequestResponse,
  scannerOutcomeResponse,
} from "@/features/scanner/response";
import {
  getScannerServiceDeps,
  validateScan,
} from "@/features/scanner/service";

export const dynamic = "force-dynamic";

/**
 * Ticket validation endpoint for the staff scanner. Authorizes the staff
 * user server-side on every call; scanner, supervisor and administrator
 * roles are allowed. The submitted value is validated entirely on the
 * server and is never logged, stored or reflected back. Responses are
 * private and never cached.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireScanner();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return scannerInvalidRequestResponse();
  }

  try {
    const outcome = await validateScan(
      getScannerServiceDeps(),
      guard.session,
      body
    );
    return scannerOutcomeResponse(outcome);
  } catch {
    return scannerInternalErrorResponse();
  }
}
