/**
 * Strict TypeScript definitions for the graduation check-in database schema.
 *
 * These types mirror the initial migration in supabase/migrations. After the
 * migration is deployed to a linked Supabase project, regenerate this file
 * with the Supabase CLI type generator so it always matches the live schema.
 *
 * This file contains schema shapes only. It must never contain credentials.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type GraduationEventStatus = "draft" | "active" | "closed" | "archived";

export type RegistrationSource = "mock" | "registration_export" | "manual";

export type RegistrationStatus =
  | "eligible"
  | "review_required"
  | "cancelled"
  | "failed";

export type PaymentStatus =
  | "unknown"
  | "amount_recorded"
  | "paid"
  | "pending"
  | "failed"
  | "refunded"
  | "waived";

export type GuestCategory = "adult" | "child_0_4" | "child_5_10";

export type TicketStatus = "pending" | "active" | "revoked" | "replaced";

export type StaffRole = "scanner" | "supervisor" | "administrator";

export type CheckinMethod =
  | "qr_scan"
  | "manual_search"
  | "supervisor_adjustment"
  | "system";

export type CheckinAction = "admission" | "correction" | "reversal";

export type RegistrationImportStatus =
  | "uploaded"
  | "preview_ready"
  | "applying"
  | "applied"
  | "failed"
  | "cancelled"
  | "duplicate";

export type RegistrationImportRowResult =
  | "new"
  | "update"
  | "unchanged"
  | "warning"
  | "error"
  | "excluded"
  | "applied";

export type GraduationEventRow = {
  id: string;
  event_code: string;
  event_name: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  venue_name: string | null;
  venue_address: string | null;
  status: GraduationEventStatus;
  is_test: boolean;
  created_at: string;
  updated_at: string;
}

export type GraduationEventInsert = {
  id?: string;
  event_code: string;
  event_name: string;
  starts_at?: string | null;
  ends_at?: string | null;
  timezone?: string;
  venue_name?: string | null;
  venue_address?: string | null;
  status?: GraduationEventStatus;
  is_test?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type GraduationEventUpdate = Partial<GraduationEventInsert>;

export type GraduationRegistrationRow = {
  id: string;
  event_id: string;
  registration_code: string;
  source_system: RegistrationSource;
  source_registration_id: string | null;
  graduate_full_name: string;
  email: string | null;
  phone: string | null;
  gown_size: string | null;
  name_pronunciation: string | null;
  registered_adult_guests: number;
  registered_children_0_4: number;
  registered_children_5_10: number;
  expected_party_size: number;
  registration_status: RegistrationStatus;
  payment_status: PaymentStatus;
  fee_total: number | null;
  tax_total: number | null;
  order_total: number | null;
  source_order_date: string | null;
  internal_notes: string | null;
  is_test: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * expected_party_size is a generated database column and is intentionally
 * excluded from insert and update shapes.
 */
export type GraduationRegistrationInsert = {
  id?: string;
  event_id: string;
  registration_code: string;
  source_system: RegistrationSource;
  source_registration_id?: string | null;
  graduate_full_name: string;
  email?: string | null;
  phone?: string | null;
  gown_size?: string | null;
  name_pronunciation?: string | null;
  registered_adult_guests?: number;
  registered_children_0_4?: number;
  registered_children_5_10?: number;
  registration_status?: RegistrationStatus;
  payment_status?: PaymentStatus;
  fee_total?: number | null;
  tax_total?: number | null;
  order_total?: number | null;
  source_order_date?: string | null;
  internal_notes?: string | null;
  is_test?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type GraduationRegistrationUpdate =
  Partial<GraduationRegistrationInsert>;

export type RegistrationGuestRow = {
  id: string;
  registration_id: string;
  guest_category: GuestCategory;
  guest_name: string | null;
  sort_order: number;
  is_test: boolean;
  created_at: string;
  updated_at: string;
}

export type RegistrationGuestInsert = {
  id?: string;
  registration_id: string;
  guest_category: GuestCategory;
  guest_name?: string | null;
  sort_order: number;
  is_test?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type RegistrationGuestUpdate = Partial<RegistrationGuestInsert>;

export type GraduationTicketRow = {
  id: string;
  registration_id: string;
  ticket_code: string;
  token_hash: string;
  status: TicketStatus;
  issued_at: string | null;
  sent_at: string | null;
  revoked_at: string | null;
  replaced_by_ticket_id: string | null;
  is_test: boolean;
  created_at: string;
  updated_at: string;
}

export type GraduationTicketInsert = {
  id?: string;
  registration_id: string;
  ticket_code: string;
  token_hash: string;
  status?: TicketStatus;
  issued_at?: string | null;
  sent_at?: string | null;
  revoked_at?: string | null;
  replaced_by_ticket_id?: string | null;
  is_test?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type GraduationTicketUpdate = Partial<GraduationTicketInsert>;

export type StaffProfileRow = {
  user_id: string;
  display_name: string;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type StaffProfileInsert = {
  user_id: string;
  display_name: string;
  role?: StaffRole;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type StaffProfileUpdate = Partial<StaffProfileInsert>;

export type GraduationCheckinRow = {
  id: string;
  registration_id: string;
  ticket_id: string | null;
  staff_user_id: string | null;
  staff_name_snapshot: string | null;
  method: CheckinMethod;
  action: CheckinAction;
  graduate_delta: number;
  adult_guest_delta: number;
  child_0_4_delta: number;
  child_5_10_delta: number;
  idempotency_key: string;
  notes: string | null;
  reverses_checkin_id: string | null;
  is_test: boolean;
  created_at: string;
}

export type GraduationCheckinInsert = {
  id?: string;
  registration_id: string;
  ticket_id?: string | null;
  staff_user_id?: string | null;
  staff_name_snapshot?: string | null;
  method: CheckinMethod;
  action: CheckinAction;
  graduate_delta?: number;
  adult_guest_delta?: number;
  child_0_4_delta?: number;
  child_5_10_delta?: number;
  idempotency_key: string;
  notes?: string | null;
  reverses_checkin_id?: string | null;
  is_test?: boolean;
  created_at?: string;
}

export type GraduationCheckinUpdate = Partial<GraduationCheckinInsert>;

export type RegistrationImportRow = {
  id: string;
  event_id: string;
  original_filename: string;
  file_sha256: string;
  file_size_bytes: number;
  worksheet_name: string;
  source_system: RegistrationSource;
  status: RegistrationImportStatus;
  total_rows: number;
  new_rows: number;
  updated_rows: number;
  unchanged_rows: number;
  warning_rows: number;
  error_rows: number;
  excluded_rows: number;
  missing_existing_rows: number;
  created_by: string | null;
  applied_by: string | null;
  created_at: string;
  applied_at: string | null;
  updated_at: string;
}

export type RegistrationImportInsert = {
  id?: string;
  event_id: string;
  original_filename: string;
  file_sha256: string;
  file_size_bytes: number;
  worksheet_name: string;
  source_system?: RegistrationSource;
  status?: RegistrationImportStatus;
  total_rows?: number;
  new_rows?: number;
  updated_rows?: number;
  unchanged_rows?: number;
  warning_rows?: number;
  error_rows?: number;
  excluded_rows?: number;
  missing_existing_rows?: number;
  created_by?: string | null;
  applied_by?: string | null;
  created_at?: string;
  applied_at?: string | null;
  updated_at?: string;
}

export type RegistrationImportUpdate = Partial<RegistrationImportInsert>;

/**
 * Row of the registration_import_rows table. The double Row suffix follows
 * the table name plus the established Row naming convention.
 */
export type RegistrationImportRowRow = {
  id: string;
  import_id: string;
  source_row_number: number;
  source_registration_id: string | null;
  graduate_full_name: string | null;
  email: string | null;
  phone: string | null;
  gown_size: string | null;
  name_pronunciation: string | null;
  guest_1_name: string | null;
  guest_2_name: string | null;
  registered_adult_guests: number;
  registered_children_0_4: number;
  registered_children_5_10: number;
  expected_party_size: number;
  source_order_status: string | null;
  registration_status: RegistrationStatus;
  payment_status: PaymentStatus;
  fee_total: number | null;
  tax_total: number | null;
  order_total: number | null;
  source_order_date: string | null;
  result: RegistrationImportRowResult;
  validation_errors: Json;
  validation_warnings: Json;
  existing_registration_id: string | null;
  normalized_snapshot: Json;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RegistrationImportRowInsert = {
  id?: string;
  import_id: string;
  source_row_number: number;
  source_registration_id?: string | null;
  graduate_full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  gown_size?: string | null;
  name_pronunciation?: string | null;
  guest_1_name?: string | null;
  guest_2_name?: string | null;
  registered_adult_guests?: number;
  registered_children_0_4?: number;
  registered_children_5_10?: number;
  expected_party_size?: number;
  source_order_status?: string | null;
  registration_status?: RegistrationStatus;
  payment_status?: PaymentStatus;
  fee_total?: number | null;
  tax_total?: number | null;
  order_total?: number | null;
  source_order_date?: string | null;
  result?: RegistrationImportRowResult;
  validation_errors?: Json;
  validation_warnings?: Json;
  existing_registration_id?: string | null;
  normalized_snapshot?: Json;
  applied_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type RegistrationImportRowUpdate = Partial<RegistrationImportRowInsert>;

export type Database = {
  public: {
    Tables: {
      graduation_events: {
        Row: GraduationEventRow;
        Insert: GraduationEventInsert;
        Update: GraduationEventUpdate;
        Relationships: [];
      };
      graduation_registrations: {
        Row: GraduationRegistrationRow;
        Insert: GraduationRegistrationInsert;
        Update: GraduationRegistrationUpdate;
        Relationships: [];
      };
      registration_guests: {
        Row: RegistrationGuestRow;
        Insert: RegistrationGuestInsert;
        Update: RegistrationGuestUpdate;
        Relationships: [];
      };
      graduation_tickets: {
        Row: GraduationTicketRow;
        Insert: GraduationTicketInsert;
        Update: GraduationTicketUpdate;
        Relationships: [];
      };
      staff_profiles: {
        Row: StaffProfileRow;
        Insert: StaffProfileInsert;
        Update: StaffProfileUpdate;
        Relationships: [];
      };
      graduation_checkins: {
        Row: GraduationCheckinRow;
        Insert: GraduationCheckinInsert;
        Update: GraduationCheckinUpdate;
        Relationships: [];
      };
      registration_imports: {
        Row: RegistrationImportRow;
        Insert: RegistrationImportInsert;
        Update: RegistrationImportUpdate;
        Relationships: [];
      };
      registration_import_rows: {
        Row: RegistrationImportRowRow;
        Insert: RegistrationImportRowInsert;
        Update: RegistrationImportRowUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      apply_registration_import: {
        Args: { p_import_id: string };
        Returns: Json;
      };
    };
    Enums: {
      graduation_event_status: GraduationEventStatus;
      registration_source: RegistrationSource;
      registration_status: RegistrationStatus;
      payment_status: PaymentStatus;
      guest_category: GuestCategory;
      ticket_status: TicketStatus;
      staff_role: StaffRole;
      checkin_method: CheckinMethod;
      checkin_action: CheckinAction;
      registration_import_status: RegistrationImportStatus;
      registration_import_row_result: RegistrationImportRowResult;
    };
    CompositeTypes: Record<string, never>;
  };
}
