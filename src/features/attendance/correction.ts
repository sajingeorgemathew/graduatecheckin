import "server-only";

/**
 * Attendance correction service. Inserts one append-only correction row with
 * positive or negative deltas. Supervisor-level authorization, a required
 * reason, the server-resolved active event and a signed registration
 * reference are enforced before the atomic apply_attendance_correction
 * function runs. That function locks the registration, recalculates
 * attendance and keeps every final total within zero and the registered
 * allowance inside the transaction.
 */

import type { StaffSession } from "@/features/auth/types";
import { verifyRegistrationReference } from "./action-token";
import { internalError, invalidRequestError, unauthorizedError } from "./errors";
import { correctionSchema } from "./schemas";
import {
  isAuthorized,
  mapWriteResult,
  referenceOrFailure,
  resolveEventOrFailure,
  type AttendanceServiceDeps,
} from "./service";
import type { AttendanceOutcome, AttendanceWriteView } from "./types";

export async function applyAttendanceCorrection(
  deps: AttendanceServiceDeps,
  session: StaffSession,
  body: unknown
): Promise<AttendanceOutcome<AttendanceWriteView>> {
  if (!isAuthorized(session)) {
    return unauthorizedError();
  }
  const parsed = correctionSchema.safeParse(body);
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

    const raw = await deps.repo.applyCorrectionRpc({
      actorUserId: session.userId,
      eventId: event.id,
      registrationId: reference.id,
      requestId: input.requestId,
      graduateDelta: input.graduateDelta,
      adultGuestDelta: input.adultGuestDelta,
      child0To4Delta: input.child0To4Delta,
      child5To10Delta: input.child5To10Delta,
      reason: input.reason,
    });
    return mapWriteResult(raw);
  } catch {
    return internalError();
  }
}
