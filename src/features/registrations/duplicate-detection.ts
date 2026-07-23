/**
 * Likely-duplicate detection for manually added graduates.
 *
 * A late RSVP, a missing RSVP and a walk-in all arrive through the same
 * form, often while the same graduate already exists from the workbook.
 * These checks warn; they never block. An administrator who knows the two
 * records are different people may override with a recorded reason.
 *
 * Pure functions over already-loaded registrations, so the rule set is
 * unit testable without a database.
 */

export interface ExistingGraduate {
  registrationId: string;
  graduateFullName: string;
  email: string | null;
  phone: string | null;
  studentId: string | null;
}

export interface ManualGraduateCandidate {
  graduateFullName: string;
  email: string | null;
  phone: string | null;
  studentId: string | null;
}

export type DuplicateSignal =
  | "same_email"
  | "same_phone"
  | "same_student_id"
  | "similar_name";

export interface DuplicateWarning {
  signal: DuplicateSignal;
  registrationId: string;
  existingName: string;
  message: string;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function nameTokens(value: string | null | undefined): string[] {
  return normalizeText(value)
    .replace(/[.,'’-]/g, " ")
    .split(" ")
    .filter((token) => token.length > 1);
}

/**
 * True when two names are close enough that a human would want to check.
 * Deliberately generous: token overlap in either direction counts, so
 * "Priya Raman" matches "Raman, Priya" and "Priya A Raman".
 */
export function namesAreSimilar(left: string, right: string): boolean {
  const a = nameTokens(left);
  const b = nameTokens(right);
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  const setB = new Set(b);
  const shared = a.filter((token) => setB.has(token)).length;
  return shared >= Math.min(a.length, b.length) && shared >= 2;
}

const MESSAGES: Record<DuplicateSignal, string> = {
  same_email: "An existing graduate already uses this email address.",
  same_phone: "An existing graduate already uses this phone number.",
  same_student_id: "An existing graduate already uses this student ID.",
  similar_name: "An existing graduate has a very similar name.",
};

/**
 * Finds every likely duplicate for a candidate graduate. One existing
 * record can raise several signals; each is reported so the administrator
 * sees exactly what matched.
 */
export function findDuplicateWarnings(
  candidate: ManualGraduateCandidate,
  existing: readonly ExistingGraduate[]
): DuplicateWarning[] {
  const warnings: DuplicateWarning[] = [];
  const email = normalizeText(candidate.email);
  const phone = normalizeDigits(candidate.phone);
  const studentId = normalizeText(candidate.studentId);

  for (const record of existing) {
    const push = (signal: DuplicateSignal) => {
      warnings.push({
        signal,
        registrationId: record.registrationId,
        existingName: record.graduateFullName,
        message: MESSAGES[signal],
      });
    };

    if (email.length > 0 && normalizeText(record.email) === email) {
      push("same_email");
    }
    // Short digit strings match too easily to be a useful signal.
    if (phone.length >= 7 && normalizeDigits(record.phone) === phone) {
      push("same_phone");
    }
    if (
      studentId.length > 0 &&
      normalizeText(record.studentId) === studentId
    ) {
      push("same_student_id");
    }
    if (namesAreSimilar(candidate.graduateFullName, record.graduateFullName)) {
      push("similar_name");
    }
  }

  return warnings;
}
