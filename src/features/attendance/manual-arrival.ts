import "server-only";

/**
 * Manual arrival service. Records one append-only positive admission for a
 * registration whose QR ticket is unavailable. Supervisor-level
 * authorization, a required reason, the server-resolved active event and a
 * signed registration reference are all enforced before the atomic
 * apply_manual_graduation_arrival function runs. That function locks the
 * registration, recalculates attendance and enforces allowances inside the
 * transaction.
 */

import type { StaffSession } from "@/features/auth/types";
import { verifyRegistrationReference } from "./action-token";
import { internalError, invalidRequestError, unauthorizedError } from "./errors";
import { manualArrivalSchema } from "./schemas";
import {
  isAuthorized,
  mapWriteResult,
  referenceOrFailure,
  resolveEventOrFailure,
  type AttendanceServiceDeps,
} from "./service";
import type { AttendanceOutcome, AttendanceWriteView } from "./types";

export async function recordManualArrival(
  deps: AttendanceServiceDeps,
  session: StaffSession,
  body: unknown
): Promise<AttendanceOutcome<AttendanceWriteView>> {
  if (!isAuthorized(session)) {
    return unauthorizedError();
  }
  const parsed = manualArrivalSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequestError();
  }
  const input = parsed.data;

  try {
    const resolved = await resolveEventOrFailure<AttendanceWriteView>(deps);
    if (!resolved.ok) {
      return resolved.outcome;
    }
    const event = resolved.event;

    const reference = referenceOrFailure<AttendanceWriteView>(
      verifyRegistrationReference(
        input.registrationReference,
        event.event_code,
        deps.signingSecret()
      )
    );
    if (!reference.ok) {
      return reference.outcome;
    }

    const raw = await deps.repo.applyManualArrivalRpc({
      actorUserId: session.userId,
      eventId: event.id,
      registrationId: reference.id,
      requestId: input.requestId,
      graduateArriving: input.graduateArriving,
      adultGuestsArriving: input.adultGuestsArriving,
      children0To4Arriving: input.children0To4Arriving,
      children5To10Arriving: input.children5To10Arriving,
      reason: input.reason,
    });
    return mapWriteResult(raw);
  } catch {
    return internalError();
  }
}
