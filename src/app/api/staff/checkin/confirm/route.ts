import type { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireScanner } from "@/features/auth/guards";
import {
  checkinInvalidRequestError,
  checkinInternalError,
} from "@/features/checkin/errors";
import { checkinOutcomeResponse } from "@/features/checkin/response";
import {
  confirmCheckin,
  getCheckinServiceDeps,
} from "@/features/checkin/service";

export const dynamic = "force-dynamic";

/**
 * Arrival confirmation endpoint. Authorizes the staff user server-side on
 * every call; scanner, supervisor and administrator roles are allowed. The
 * acting user comes from the trusted session and the active event is
 * resolved server-side. The browser sends only the validation-attempt id,
 * a request id and the arriving-now counts; it can never send an event,
 * ticket, registration or actor id. The request body is never logged and
 * responses are private, never cached and never carry database details.
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
    return checkinOutcomeResponse(checkinInvalidRequestError());
  }

  try {
    const outcome = await confirmCheckin(
      getCheckinServiceDeps(),
      guard.session,
      body
    );
    return checkinOutcomeResponse(outcome);
  } catch {
    return checkinOutcomeResponse(checkinInternalError());
  }
}
