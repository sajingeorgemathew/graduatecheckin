/**
 * Staff administration types. Views exposed to the UI contain profile
 * fields only; passwords, tokens, session data and Auth provider internals
 * are never included.
 */

import type { StaffRole } from "@/types/database";

export interface StaffAccountView {
  userId: string;
  displayName: string;
  email: string;
  role: StaffRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface StaffListPage {
  accounts: StaffAccountView[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export type StaffListFilter =
  | "all"
  | "active"
  | "inactive"
  | "scanner"
  | "supervisor"
  | "administrator";

/**
 * Returned exactly once after account creation or a temporary password
 * reset. The temporary password exists only in this in-flight response and
 * is never stored anywhere.
 */
export interface CreatedStaffAccount {
  userId: string;
  email: string;
  displayName: string;
  role: StaffRole;
  temporaryPassword: string;
}

export interface TemporaryPasswordReset {
  userId: string;
  email: string;
  temporaryPassword: string;
}

export interface StaffStructuredError {
  error: {
    code: string;
    message: string;
  };
}

export type StaffServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: StaffStructuredError };
