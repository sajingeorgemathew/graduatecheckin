import "server-only";

/**
 * Manually adding a graduate.
 *
 * Covers the late RSVP, the missing RSVP, the administrator-added graduate,
 * the walk-in and the graduate created from the future roster. The target
 * event is fixed server-side and never accepted from the browser.
 *
 * A walk-in is deliberately allowed to exist with no email address and no
 * PDF: they can still be registered, ticketed and checked in at the door.
 */

import { randomUUID } from "node:crypto";
import { canAccessAdmin } from "@/features/auth/permissions";
import type { StaffSession } from "@/features/auth/types";
import { ACTIVE_EVENT_FAILURE_MESSAGES } from "@/features/events/active-event";
import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import * as repo from "@/features/manual-delivery/repository";
import type { StructuredError } from "@/features/manual-delivery/types";
import type { RegistrationGuestInsert } from "@/types/database";

import {
  findDuplicateWarnings,
  type DuplicateWarning,
  type ExistingGraduate,
} from "./duplicate-detection";
import {
  duplicateCheckSchema,
  manualRegistrationSchema,
  MANUAL_REGISTRATION_SOURCE_LABELS,
  type ManualRegistrationInput,
} from "./schemas";

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
    "Administrator access is required to add a graduate."
  );
}

async function loadExistingGraduates(
  eventId: string
): Promise<ExistingGraduate[]> {
  const registrations = await repo.listEventRegistrations(eventId);
  return registrations.map((registration) => ({
    registrationId: registration.id,
    graduateFullName: registration.graduate_full_name,
    email: registration.email,
    phone: registration.phone,
    // Student IDs are only recorded for manually added graduates, in the
    // registration code; the roster carries the authoritative value.
    studentId: null,
  }));
}

/** Live duplicate check used by the form before anything is written. */
export async function checkForDuplicates(
  actor: StaffSession,
  body: unknown
): Promise<ServiceResult<{ warnings: DuplicateWarning[] }>> {
  if (!canAccessAdmin(actor.role)) {
    return accessFailure();
  }
  const parsed = duplicateCheckSchema.safeParse(body);
  if (!parsed.success) {
    return failure(422, "invalid_request", "The duplicate check is invalid.");
  }

  const resolution = await resolveActiveEvent();
  if (!resolution.ok) {
    return { ok: true, data: { warnings: [] } };
  }

  const existing = await loadExistingGraduates(resolution.event.id);
  return {
    ok: true,
    data: {
      warnings: findDuplicateWarnings(
        {
          graduateFullName: parsed.data.graduateFullName,
          email: parsed.data.email ?? null,
          phone: parsed.data.phone ?? null,
          studentId: parsed.data.studentId ?? null,
        },
        existing
      ),
    },
  };
}

export interface ManualRegistrationResult {
  registrationId: string;
  registrationCode: string;
  duplicateWarnings: DuplicateWarning[];
}

function buildInternalNotes(input: ManualRegistrationInput): string | null {
  const parts: string[] = [
    `Source: ${MANUAL_REGISTRATION_SOURCE_LABELS[input.source]}.`,
  ];
  if (input.studentId !== null && input.studentId !== undefined) {
    parts.push(`Student ID: ${input.studentId}.`);
  }
  if (input.paymentNote !== null && input.paymentNote !== undefined) {
    parts.push(`Payment/approval: ${input.paymentNote}`);
  }
  if (input.overrideReason !== null && input.overrideReason !== undefined) {
    parts.push(`Duplicate override: ${input.overrideReason}`);
  }
  if (input.internalNote !== null && input.internalNote !== undefined) {
    parts.push(input.internalNote);
  }
  return parts.length === 0 ? null : parts.join(" ");
}

/**
 * Creates one manually added graduate.
 *
 * When a likely duplicate is found the request is rejected until the
 * administrator both acknowledges the warnings and supplies a reason, so a
 * duplicate is never created by simply pressing Save twice.
 */
export async function createManualRegistration(
  actor: StaffSession,
  body: unknown
): Promise<ServiceResult<ManualRegistrationResult>> {
  if (!canAccessAdmin(actor.role)) {
    return accessFailure();
  }

  const parsed = manualRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return failure(
      422,
      "invalid_registration",
      "Check the graduate name, guest counts and child counts."
    );
  }
  const input = parsed.data;

  const resolution = await resolveActiveEvent();
  if (!resolution.ok) {
    return failure(
      409,
      resolution.code,
      ACTIVE_EVENT_FAILURE_MESSAGES[resolution.code]
    );
  }
  const event = resolution.event;

  const existing = await loadExistingGraduates(event.id);
  const duplicateWarnings = findDuplicateWarnings(
    {
      graduateFullName: input.graduateFullName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      studentId: input.studentId ?? null,
    },
    existing
  );

  if (duplicateWarnings.length > 0) {
    const reason = (input.overrideReason ?? "").trim();
    if (!input.acknowledgeDuplicates || reason.length < 5) {
      return {
        ok: false,
        status: 409,
        error: {
          error: {
            code: "duplicate_warning",
            message:
              `${duplicateWarnings.length} possible duplicate(s) were ` +
              "found. Confirm the graduate is genuinely different and " +
              "supply an override reason of at least 5 characters.",
          },
        },
      };
    }
  }

  const registrationCode = `REG-MAN-${randomUUID().slice(0, 8).toUpperCase()}`;

  const registration = await repo.insertRegistration({
    event_id: event.id,
    registration_code: registrationCode,
    source_system: "manual",
    source_registration_id: null,
    graduate_full_name: input.graduateFullName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    gown_size: input.gownSize ?? null,
    name_pronunciation: input.namePronunciation ?? null,
    registered_adult_guests: input.adultGuestCount,
    registered_children_0_4: input.children04,
    registered_children_5_10: input.children510,
    // A manually added graduate is eligible immediately: the administrator
    // adding them is the approval.
    registration_status: "eligible",
    payment_status: input.paymentNote === null ? "unknown" : "waived",
    internal_notes: buildInternalNotes(input),
    is_test: event.is_test,
  });

  const guests: RegistrationGuestInsert[] = input.adultGuestNames.map(
    (name, index) => ({
      registration_id: registration.id,
      guest_category: "adult",
      guest_name: name,
      sort_order: index + 1,
      is_test: event.is_test,
    })
  );
  await repo.insertGuests(guests);

  return {
    ok: true,
    data: {
      registrationId: registration.id,
      registrationCode,
      duplicateWarnings,
    },
  };
}
