/**
 * Trusted staff-session types. A StaffSession is only ever constructed
 * server-side from a verified Supabase Auth user plus the staff profile
 * loaded with trusted server credentials. Role information from forms,
 * query parameters, headers or browser state is never accepted.
 */

import type { StaffRole } from "@/types/database";

export interface StaffSession {
  userId: string;
  email: string;
  displayName: string;
  role: StaffRole;
  isActive: boolean;
  mustChangePassword: boolean;
}

/** Server-side resolution of the caller before role checks. */
export type SessionResolution =
  | { kind: "anonymous" }
  | { kind: "no_profile"; userId: string }
  | { kind: "inactive"; userId: string }
  | { kind: "active"; session: StaffSession };

export type GuardFailureCode =
  | "not_authenticated"
  | "account_inactive"
  | "password_change_required"
  | "not_authorized";

export type GuardResult =
  | { ok: true; session: StaffSession }
  | { ok: false; status: 401 | 403; code: GuardFailureCode; message: string };

export interface StructuredAuthError {
  error: {
    code: string;
    message: string;
  };
}
