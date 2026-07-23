/**
 * Roster search. Pure and runtime-neutral so the matching rules are unit
 * testable and can be shared by the page and any later API.
 */

export interface RosterCandidateView {
  candidateId: string;
  studentId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  program: string | null;
  batch: string | null;
  /** Set once the candidate has been turned into a registration. */
  registrationId: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Matches on student ID, name, email, phone, program or batch. */
export function searchRosterCandidates(
  candidates: readonly RosterCandidateView[],
  search: string
): RosterCandidateView[] {
  const term = normalize(search);
  if (term.length === 0) {
    return [...candidates];
  }
  const termDigits = digits(term);

  return candidates.filter((candidate) => {
    if (normalize(candidate.studentId).includes(term)) {
      return true;
    }
    if (normalize(candidate.fullName).includes(term)) {
      return true;
    }
    if (normalize(candidate.email).includes(term)) {
      return true;
    }
    if (
      termDigits.length >= 3 &&
      digits(candidate.phone).includes(termDigits)
    ) {
      return true;
    }
    if (normalize(candidate.program).includes(term)) {
      return true;
    }
    return normalize(candidate.batch).includes(term);
  });
}
