/**
 * Shared fictional fixtures for authentication and staff tests. Every
 * value is fabricated; no real student or staff data is ever used.
 */

import type { StaffSession } from "@/features/auth/types";
import type { StaffProfileRow, StaffRole } from "@/types/database";

export const FICTIONAL_ADMIN_ID = "00000000-0000-4000-8000-0000000000a1";
export const FICTIONAL_TARGET_ID = "00000000-0000-4000-8000-0000000000b2";

export function fictionalProfile(
  overrides: Partial<StaffProfileRow> = {}
): StaffProfileRow {
  return {
    user_id: FICTIONAL_TARGET_ID,
    display_name: "Fictional Staff",
    role: "scanner",
    is_active: true,
    email_snapshot: "fictional.staff@example.com",
    must_change_password: false,
    last_login_at: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-07-17T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:00.000Z",
    ...overrides,
  };
}

export function fictionalSession(
  role: StaffRole,
  overrides: Partial<StaffSession> = {}
): StaffSession {
  return {
    userId: FICTIONAL_ADMIN_ID,
    email: "fictional.admin@example.com",
    displayName: "Fictional Admin",
    role,
    isActive: true,
    mustChangePassword: false,
    ...overrides,
  };
}
