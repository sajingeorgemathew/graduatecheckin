import "server-only";

/**
 * Attendance reversal service. Inserts one append-only row holding the exact
 * negative of an eligible original entry. Supervisor-level authorization, a
 * required reason, the server-resolved active event and a signed entry
 * reference are enforced before the atomic reverse_graduation_checkin
 * function runs. That function locks the original row and registration,
 * rejects reversing a reversal or an already-reversed row and rejects a
 * reversal that would create negative attendance.
 */

import type { StaffSession } from "@/features/auth/types";
import { verifyEntryReference } from "./action-token";
import { internalError, invalidRequestError, unauthorizedError } from "./errors";
import { reversalSchema } from "./schemas";
import {
  isAuthorized,
  mapWriteResult,
  referenceOrFailure,
  resolveEventOrFailure,
  type AttendanceServiceDeps,
} from "./service";
import type { AttendanceOutcome, AttendanceWriteView } from "./types";

export async function reverseAttendanceEntry(
  deps: AttendanceServiceDeps,
  session: StaffSession,
  body: unknown
): Promise<AttendanceOutcome<AttendanceWriteView>> {
  if (!isAuthorized(session)) {
    return unauthorizedError();
  }
  const parsed = reversalSchema.safeParse(body);
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
      verifyEntryReference(
        input.entryReference,
        event.event_code,
        deps.signingSecret()
      )
    );
    if (!reference.ok) {
      return reference.outcome;
    }

    const raw = await deps.repo.reverseCheckinRpc({
      actorUserId: session.userId,
      eventId: event.id,
      originalCheckinId: reference.id,
      requestId: input.requestId,
      reason: input.reason,
    });
    return mapWriteResult(raw);
  } catch {
    return internalError();
  }
}
