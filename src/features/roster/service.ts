import "server-only";

/**
 * The future full graduate roster.
 *
 * Roster candidates are deliberately kept apart from event registrations: a
 * candidate is somebody who may graduate, not somebody who has registered.
 * A candidate never receives a ticket. An administrator turns one into a
 * production registration explicitly, and the link back to the candidate is
 * recorded so the roster shows who has already been registered.
 *
 * The roster is not required to send tickets to the current RSVP graduates.
 */

import { canAccessAdmin } from "@/features/auth/permissions";
import type { StaffSession } from "@/features/auth/types";
import { ACTIVE_EVENT_FAILURE_MESSAGES } from "@/features/events/active-event";
import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import * as repo from "@/features/manual-delivery/repository";
import type { StructuredError } from "@/features/manual-delivery/types";
import { createManualRegistration } from "@/features/registrations/service";

import { searchRosterCandidates, type RosterCandidateView } from "./search";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: StructuredError };

function failure<T>(
  status: number,
  code: string,
  message: string
): ServiceResult<T> {
  return { ok: false, status, error: { error: { code, message } } };
}

function accessFailure<T>(): ServiceResult<T> {
  return failure(
    403,
    "not_authorized",
    "Administrator access is required for the graduate roster."
  );
}

export interface RosterData {
  eventName: string;
  totalCandidates: number;
  candidates: RosterCandidateView[];
  search: string;
}

export async function loadRoster(
  actor: StaffSession | null,
  search: string
): Promise<ServiceResult<RosterData>> {
  if (actor === null || !canAccessAdmin(actor.role)) {
    return accessFailure();
  }

  const resolution = await resolveActiveEvent();
  if (!resolution.ok) {
    return failure(
      409,
      resolution.code,
      ACTIVE_EVENT_FAILURE_MESSAGES[resolution.code]
    );
  }

  const rows = await repo.listRosterCandidates(resolution.event.id);
  const candidates: RosterCandidateView[] = rows.map((row) => ({
    candidateId: row.id,
    studentId: row.student_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    program: row.program,
    batch: row.batch,
    registrationId: row.registration_id,
  }));

  return {
    ok: true,
    data: {
      eventName: resolution.event.event_name,
      totalCandidates: candidates.length,
      candidates: searchRosterCandidates(candidates, search),
      search,
    },
  };
}

/**
 * Creates a production registration from one roster candidate. The manual
 * registration service performs the duplicate checks, so a candidate who
 * already registered through the workbook is caught here too.
 */
export async function createRegistrationFromCandidate(
  actor: StaffSession,
  candidateId: string,
  overrideReason: string | null
): Promise<ServiceResult<{ registrationId: string }>> {
  if (!canAccessAdmin(actor.role)) {
    return accessFailure();
  }

  const resolution = await resolveActiveEvent();
  if (!resolution.ok) {
    return failure(
      409,
      resolution.code,
      ACTIVE_EVENT_FAILURE_MESSAGES[resolution.code]
    );
  }

  const candidates = await repo.listRosterCandidates(resolution.event.id);
  const candidate = candidates.find((row) => row.id === candidateId);
  if (candidate === undefined) {
    return failure(
      404,
      "candidate_not_found",
      "The roster candidate was not found."
    );
  }
  if (candidate.registration_id !== null) {
    return failure(
      409,
      "already_registered",
      "This roster candidate already has a production registration."
    );
  }

  const created = await createManualRegistration(actor, {
    graduateFullName: candidate.full_name,
    email: candidate.email,
    phone: candidate.phone,
    studentId: candidate.student_id,
    adultGuestNames: [],
    adultGuestCount: 0,
    children04: 0,
    children510: 0,
    source: "roster",
    internalNote:
      candidate.program === null
        ? null
        : `Program: ${candidate.program}. Batch: ${candidate.batch ?? "n/a"}.`,
    overrideReason,
    acknowledgeDuplicates: overrideReason !== null,
  });
  if (!created.ok) {
    return created;
  }

  await repo.linkRosterCandidate(candidateId, created.data.registrationId);
  return { ok: true, data: { registrationId: created.data.registrationId } };
}
