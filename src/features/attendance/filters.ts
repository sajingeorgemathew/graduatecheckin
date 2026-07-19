/**
 * Attendance search filter definitions. These shapes are shared by the client
 * filter controls and the server search service, so this module is safe to
 * import from both and contains no secrets, identifiers or personal values.
 *
 * Filters combine with the search term and are always enforced server-side.
 * The RSVP filter offers only "all" and "signed up": every graduation
 * registration is an RSVP registration, so "signed up" means a matching RSVP
 * registration exists. A "not signed up" option is intentionally absent.
 *
 * Developer note: an accurate "not signed up" list requires the complete
 * invited-graduate roster, which does not exist in this schema today. There
 * is no invitation or roster table; graduation_registrations holds only RSVP
 * responses. Until a complete invitation roster is imported (a later ticket),
 * "not signed up" cannot be calculated and must not be fabricated from missing
 * registration rows.
 */

export type AttendanceStatusFilter =
  | "all"
  | "not_arrived"
  | "partial"
  | "complete";

export type RegistrationStatusFilter =
  | "all"
  | "eligible"
  | "review_required"
  | "cancelled"
  | "failed";

export type TicketStatusFilter =
  | "all"
  | "active"
  | "none"
  | "replaced"
  | "revoked"
  | "pending";

export type EnvironmentFilter = "all" | "test" | "production";

export type RsvpStatusFilter = "all" | "signed_up";

export interface AttendanceFilters {
  attendanceStatus: AttendanceStatusFilter;
  registrationStatus: RegistrationStatusFilter;
  ticketStatus: TicketStatusFilter;
  environment: EnvironmentFilter;
  rsvpStatus: RsvpStatusFilter;
}

export const DEFAULT_FILTERS: AttendanceFilters = {
  attendanceStatus: "all",
  registrationStatus: "all",
  ticketStatus: "all",
  environment: "all",
  rsvpStatus: "all",
};

/** True when no filter differs from its default. */
export function filtersAreDefault(filters: AttendanceFilters): boolean {
  return (
    filters.attendanceStatus === "all" &&
    filters.registrationStatus === "all" &&
    filters.ticketStatus === "all" &&
    filters.environment === "all" &&
    filters.rsvpStatus === "all"
  );
}

export const ATTENDANCE_STATUS_OPTIONS: {
  value: AttendanceStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "All attendance" },
  { value: "not_arrived", label: "Not arrived" },
  { value: "partial", label: "Partially arrived" },
  { value: "complete", label: "Fully checked in" },
];

export const REGISTRATION_STATUS_OPTIONS: {
  value: RegistrationStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "All registrations" },
  { value: "eligible", label: "Eligible" },
  { value: "review_required", label: "Review required" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed", label: "Failed" },
];

export const TICKET_STATUS_OPTIONS: {
  value: TicketStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "All ticket statuses" },
  { value: "active", label: "Active" },
  { value: "none", label: "No active ticket" },
  { value: "replaced", label: "Replaced" },
  { value: "revoked", label: "Revoked" },
  { value: "pending", label: "Pending" },
];

export const ENVIRONMENT_OPTIONS: {
  value: EnvironmentFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "test", label: "Test" },
  { value: "production", label: "Production" },
];

export const RSVP_STATUS_OPTIONS: {
  value: RsvpStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "All RSVP statuses" },
  { value: "signed_up", label: "Signed up" },
];
