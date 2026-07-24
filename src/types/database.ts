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

export type TicketGenerationBatchStatus =
  | "processing"
  | "completed"
  | "partial"
  | "failed";

export type TicketActivityAction = "generated" | "replaced" | "revoked";

export type StaffRole = "scanner" | "supervisor" | "administrator";

export type CheckinMethod =
  | "qr_scan"
  | "manual_search"
  | "supervisor_adjustment"
  | "system";

export type CheckinAction = "admission" | "correction" | "reversal";

export type AttendanceEntryKind =
  | "scan_arrival"
  | "manual_arrival"
  | "correction"
  | "reversal";

export type TicketScanMethod = "qr" | "manual_code";

export type TicketValidationResult =
  | "valid"
  | "partially_checked_in"
  | "already_checked_in"
  | "invalid"
  | "revoked"
  | "replaced"
  | "pending"
  | "wrong_event"
  | "registration_blocked"
  | "rate_limited"
  | "error";

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
  token_version: number;
  status: TicketStatus;
  issued_at: string | null;
  sent_at: string | null;
  revoked_at: string | null;
  replaced_by_ticket_id: string | null;
  generation_batch_id: string | null;
  issued_by: string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
  is_test: boolean;
  created_at: string;
  updated_at: string;
}

export type GraduationTicketInsert = {
  id?: string;
  registration_id: string;
  ticket_code: string;
  token_hash: string;
  token_version?: number;
  status?: TicketStatus;
  issued_at?: string | null;
  sent_at?: string | null;
  revoked_at?: string | null;
  replaced_by_ticket_id?: string | null;
  generation_batch_id?: string | null;
  issued_by?: string | null;
  revoked_by?: string | null;
  revocation_reason?: string | null;
  is_test?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type GraduationTicketUpdate = Partial<GraduationTicketInsert>;

export type TicketGenerationBatchRow = {
  id: string;
  event_id: string;
  requested_by: string | null;
  idempotency_key: string;
  status: TicketGenerationBatchStatus;
  candidate_count: number;
  generated_count: number;
  skipped_count: number;
  error_count: number;
  is_test: boolean;
  created_at: string;
  completed_at: string | null;
}

export type TicketGenerationBatchInsert = {
  id?: string;
  event_id: string;
  requested_by?: string | null;
  idempotency_key: string;
  status?: TicketGenerationBatchStatus;
  candidate_count?: number;
  generated_count?: number;
  skipped_count?: number;
  error_count?: number;
  is_test?: boolean;
  created_at?: string;
  completed_at?: string | null;
}

export type TicketGenerationBatchUpdate = Partial<TicketGenerationBatchInsert>;

/**
 * Append-oriented audit log of ticket actions. The metadata column must
 * never contain raw tokens, token hashes, ticket secrets, emails, phone
 * numbers, guest names, access tokens or cookies.
 */
export type TicketActivityLogRow = {
  id: string;
  ticket_id: string;
  registration_id: string;
  actor_user_id: string | null;
  action: TicketActivityAction;
  previous_ticket_id: string | null;
  replacement_ticket_id: string | null;
  reason: string | null;
  request_id: string | null;
  metadata: Json;
  created_at: string;
}

export type TicketActivityLogInsert = {
  id?: string;
  ticket_id: string;
  registration_id: string;
  actor_user_id?: string | null;
  action: TicketActivityAction;
  previous_ticket_id?: string | null;
  replacement_ticket_id?: string | null;
  reason?: string | null;
  request_id?: string | null;
  metadata?: Json;
  created_at?: string;
}

export type TicketActivityLogUpdate = Partial<TicketActivityLogInsert>;

export type StaffProfileRow = {
  user_id: string;
  display_name: string;
  role: StaffRole;
  is_active: boolean;
  email_snapshot: string;
  must_change_password: boolean;
  last_login_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type StaffProfileInsert = {
  user_id: string;
  display_name: string;
  role?: StaffRole;
  is_active?: boolean;
  email_snapshot?: string;
  must_change_password?: boolean;
  last_login_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type StaffProfileUpdate = Partial<StaffProfileInsert>;

export type StaffAccessAction =
  | "staff_created"
  | "role_changed"
  | "staff_activated"
  | "staff_deactivated"
  | "temporary_password_reset"
  | "password_changed"
  | "login_blocked";

/**
 * Append-oriented audit log of staff-account administration actions. The
 * JSON value columns must never contain passwords, tokens or cookies.
 */
export type StaffAccessAuditLogRow = {
  id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  action: StaffAccessAction;
  previous_values: Json;
  new_values: Json;
  reason: string | null;
  request_id: string | null;
  created_at: string;
}

export type StaffAccessAuditLogInsert = {
  id?: string;
  actor_user_id?: string | null;
  target_user_id?: string | null;
  action: StaffAccessAction;
  previous_values?: Json;
  new_values?: Json;
  reason?: string | null;
  request_id?: string | null;
  created_at?: string;
}

export type StaffAccessAuditLogUpdate = Partial<StaffAccessAuditLogInsert>;

export type GraduationCheckinRow = {
  id: string;
  registration_id: string;
  ticket_id: string | null;
  staff_user_id: string | null;
  staff_name_snapshot: string | null;
  method: CheckinMethod;
  action: CheckinAction;
  entry_kind: AttendanceEntryKind;
  graduate_delta: number;
  adult_guest_delta: number;
  child_0_4_delta: number;
  child_5_10_delta: number;
  idempotency_key: string;
  notes: string | null;
  reason: string | null;
  reverses_checkin_id: string | null;
  request_id: string | null;
  validation_attempt_id: string | null;
  recorded_by: string | null;
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
  entry_kind?: AttendanceEntryKind;
  graduate_delta?: number;
  adult_guest_delta?: number;
  child_0_4_delta?: number;
  child_5_10_delta?: number;
  idempotency_key: string;
  notes?: string | null;
  reason?: string | null;
  reverses_checkin_id?: string | null;
  request_id?: string | null;
  validation_attempt_id?: string | null;
  recorded_by?: string | null;
  is_test?: boolean;
  created_at?: string;
}

export type GraduationCheckinUpdate = Partial<GraduationCheckinInsert>;

/**
 * Privacy-safe scanner validation audit rows. A scan attempt records that
 * the server validated a ticket value and what the outcome was; it is not
 * an admission record. Rows never contain QR payloads, raw tokens, token
 * hashes, ticket codes, graduate names, emails, phone numbers, guest
 * names or payment information.
 */
export type TicketScanAttemptRow = {
  id: string;
  event_id: string | null;
  ticket_id: string | null;
  registration_id: string | null;
  staff_user_id: string;
  method: TicketScanMethod;
  result: TicketValidationResult;
  request_id: string;
  ticket_status_snapshot: TicketStatus | null;
  registration_status_snapshot: RegistrationStatus | null;
  graduate_arrived_snapshot: number | null;
  adult_guests_arrived_snapshot: number | null;
  children_0_4_arrived_snapshot: number | null;
  children_5_10_arrived_snapshot: number | null;
  created_at: string;
}

export type TicketScanAttemptInsert = {
  id?: string;
  event_id?: string | null;
  ticket_id?: string | null;
  registration_id?: string | null;
  staff_user_id: string;
  method: TicketScanMethod;
  result: TicketValidationResult;
  request_id: string;
  ticket_status_snapshot?: TicketStatus | null;
  registration_status_snapshot?: RegistrationStatus | null;
  graduate_arrived_snapshot?: number | null;
  adult_guests_arrived_snapshot?: number | null;
  children_0_4_arrived_snapshot?: number | null;
  children_5_10_arrived_snapshot?: number | null;
  created_at?: string;
}

export type TicketScanAttemptUpdate = Partial<TicketScanAttemptInsert>;

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

// ---------------------------------------------------------------------
// CHECKIN-09A: branded PDF ticket documents and export batches.
// ---------------------------------------------------------------------

export type TicketDocumentStatusEnum =
  | "current"
  | "superseded"
  | "invalidated";

export type TicketDocumentInvalidationReasonEnum =
  | "superseded"
  | "replaced"
  | "revoked"
  | "invalid";

export type TicketDocumentBatchStatusEnum =
  | "draft"
  | "generating"
  | "ready"
  | "partial"
  | "failed"
  | "exported"
  | "cancelled";

export type TicketDocumentBatchPurposeEnum =
  | "initial"
  | "updated"
  | "replacement"
  | "resend_preparation";

export type TicketDocumentBatchItemStatusEnum =
  | "ready"
  | "excluded"
  | "failed";

// CHECKIN-09B: ticket-distribution delivery model.

export type TicketDeliveryModeEnum = "test" | "production";

export type TicketDeliveryPurposeEnum =
  | "initial"
  | "updated"
  | "replacement"
  | "resend";

export type TicketDeliveryBatchStatusEnum =
  | "draft"
  | "prepared"
  | "sending"
  | "partial"
  | "completed"
  | "failed"
  | "cancelled";

export type TicketDeliveryStatusEnum =
  | "prepared"
  | "sent"
  | "failed"
  | "bounce_detected"
  | "resend_required"
  | "resent"
  | "cancelled"
  | "suppressed";

export type TicketDeliveryAttemptOutcomeEnum =
  | "sent"
  | "failed"
  | "bounce_detected"
  | "skipped"
  | "cancelled";

export type TicketDeliveryResultImportStatusEnum =
  | "uploaded"
  | "previewed"
  | "applied"
  | "rejected";

export type GraduationTicketDeliveryBatchRow = {
  id: string;
  event_id: string;
  document_batch_id: string | null;
  delivery_batch_code: string;
  mode: TicketDeliveryModeEnum;
  purpose: TicketDeliveryPurposeEnum;
  status: TicketDeliveryBatchStatusEnum;
  prepared_count: number;
  sent_count: number;
  failed_count: number;
  bounced_count: number;
  resend_required_count: number;
  cancelled_count: number;
  created_by: string | null;
  created_at: string;
  prepared_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  source_manifest_sha256: string | null;
  results_imported_at: string | null;
  updated_at: string;
}

export type GraduationTicketDeliveryBatchInsert = {
  id?: string;
  event_id: string;
  document_batch_id?: string | null;
  delivery_batch_code: string;
  mode: TicketDeliveryModeEnum;
  purpose?: TicketDeliveryPurposeEnum;
  status?: TicketDeliveryBatchStatusEnum;
  prepared_count?: number;
  sent_count?: number;
  failed_count?: number;
  bounced_count?: number;
  resend_required_count?: number;
  cancelled_count?: number;
  created_by?: string | null;
  created_at?: string;
  prepared_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  source_manifest_sha256?: string | null;
  results_imported_at?: string | null;
  updated_at?: string;
}

export type GraduationTicketDeliveryBatchUpdate =
  Partial<GraduationTicketDeliveryBatchInsert>;

export type GraduationTicketDeliveryRow = {
  id: string;
  event_id: string;
  delivery_batch_id: string;
  registration_id: string;
  ticket_id: string | null;
  document_id: string | null;
  delivery_reference: string;
  recipient_name_snapshot: string;
  recipient_email_snapshot: string;
  ticket_code_snapshot: string;
  document_version_snapshot: number;
  pdf_file_name_snapshot: string;
  pdf_sha256_snapshot: string;
  party_snapshot: Json;
  row_signature: string;
  status: TicketDeliveryStatusEnum;
  attempt_count: number;
  last_attempt_at: string | null;
  first_sent_at: string | null;
  latest_sent_at: string | null;
  bounced_at: string | null;
  resend_required_at: string | null;
  cancelled_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type GraduationTicketDeliveryInsert = {
  id?: string;
  event_id: string;
  delivery_batch_id: string;
  registration_id: string;
  ticket_id?: string | null;
  document_id?: string | null;
  delivery_reference: string;
  recipient_name_snapshot: string;
  recipient_email_snapshot: string;
  ticket_code_snapshot: string;
  document_version_snapshot: number;
  pdf_file_name_snapshot: string;
  pdf_sha256_snapshot: string;
  party_snapshot?: Json;
  row_signature: string;
  status?: TicketDeliveryStatusEnum;
  attempt_count?: number;
  last_attempt_at?: string | null;
  first_sent_at?: string | null;
  latest_sent_at?: string | null;
  bounced_at?: string | null;
  resend_required_at?: string | null;
  cancelled_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type GraduationTicketDeliveryUpdate =
  Partial<GraduationTicketDeliveryInsert>;

export type GraduationTicketDeliveryAttemptRow = {
  id: string;
  delivery_id: string;
  result_import_id: string | null;
  attempt_reference: string;
  attempt_number: number;
  intended_recipient_snapshot: string;
  actual_recipient_snapshot: string | null;
  mode: TicketDeliveryModeEnum;
  outcome: TicketDeliveryAttemptOutcomeEnum;
  attempted_at: string;
  sent_by: string | null;
  provider: string | null;
  error_code: string | null;
  error_message: string | null;
  source_row_hash: string | null;
  created_at: string;
}

export type GraduationTicketDeliveryAttemptInsert = {
  id?: string;
  delivery_id: string;
  result_import_id?: string | null;
  attempt_reference: string;
  attempt_number: number;
  intended_recipient_snapshot: string;
  actual_recipient_snapshot?: string | null;
  mode: TicketDeliveryModeEnum;
  outcome: TicketDeliveryAttemptOutcomeEnum;
  attempted_at: string;
  sent_by?: string | null;
  provider?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  source_row_hash?: string | null;
  created_at?: string;
}

export type GraduationTicketDeliveryAttemptUpdate =
  Partial<GraduationTicketDeliveryAttemptInsert>;

export type GraduationTicketDeliveryResultImportRow = {
  id: string;
  event_id: string;
  delivery_batch_id: string;
  file_name: string;
  file_sha256: string;
  status: TicketDeliveryResultImportStatusEnum;
  total_rows: number;
  accepted_rows: number;
  duplicate_rows: number;
  warning_rows: number;
  rejected_rows: number;
  imported_by: string | null;
  imported_at: string | null;
  created_at: string;
}

export type GraduationTicketDeliveryResultImportInsert = {
  id?: string;
  event_id: string;
  delivery_batch_id: string;
  file_name: string;
  file_sha256: string;
  status?: TicketDeliveryResultImportStatusEnum;
  total_rows?: number;
  accepted_rows?: number;
  duplicate_rows?: number;
  warning_rows?: number;
  rejected_rows?: number;
  imported_by?: string | null;
  imported_at?: string | null;
  created_at?: string;
}

export type GraduationTicketDeliveryResultImportUpdate =
  Partial<GraduationTicketDeliveryResultImportInsert>;

export type GraduationTicketDeliveryResultImportLineRow = {
  id: string;
  result_import_id: string;
  delivery_batch_id: string;
  row_number: number;
  delivery_reference: string;
  attempt_reference: string;
  disposition: string;
  mode: string | null;
  outcome: string | null;
  reason_code: string | null;
  message: string;
  created_at: string;
}

export type GraduationTicketDeliveryResultImportLineInsert = {
  id?: string;
  result_import_id: string;
  delivery_batch_id: string;
  row_number: number;
  delivery_reference: string;
  attempt_reference: string;
  disposition: string;
  mode?: string | null;
  outcome?: string | null;
  reason_code?: string | null;
  message?: string;
  created_at?: string;
}

export type GraduationTicketDeliveryResultImportLineUpdate =
  Partial<GraduationTicketDeliveryResultImportLineInsert>;

export type GraduationEventTicketSettingsRow = {
  id: string;
  event_id: string;
  display_title: string;
  description: string;
  program_schedule: Json;
  primary_logo_asset: string;
  secondary_asset: string | null;
  template_version: number;
  instructions: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type GraduationEventTicketSettingsInsert = {
  id?: string;
  event_id: string;
  display_title: string;
  description: string;
  program_schedule?: Json;
  primary_logo_asset: string;
  secondary_asset?: string | null;
  template_version?: number;
  instructions?: string | null;
  created_at?: string;
  updated_at?: string;
  updated_by?: string | null;
}

export type GraduationEventTicketSettingsUpdate =
  Partial<GraduationEventTicketSettingsInsert>;

export type GraduationTicketDocumentRow = {
  id: string;
  event_id: string;
  registration_id: string;
  ticket_id: string;
  document_version: number;
  template_version: number;
  status: TicketDocumentStatusEnum;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  sha256_checksum: string;
  source_fingerprint: string;
  graduate_name_snapshot: string;
  ticket_code_snapshot: string;
  registered_party_snapshot: Json;
  event_snapshot: Json;
  generated_by: string | null;
  generated_at: string;
  superseded_at: string | null;
  invalidated_at: string | null;
  invalidation_reason: TicketDocumentInvalidationReasonEnum | null;
  created_at: string;
  updated_at: string;
}

export type GraduationTicketDocumentInsert = {
  id?: string;
  event_id: string;
  registration_id: string;
  ticket_id: string;
  document_version: number;
  template_version: number;
  status?: TicketDocumentStatusEnum;
  storage_bucket?: string;
  storage_path: string;
  file_name: string;
  mime_type?: string;
  file_size_bytes: number;
  sha256_checksum: string;
  source_fingerprint: string;
  graduate_name_snapshot: string;
  ticket_code_snapshot: string;
  registered_party_snapshot: Json;
  event_snapshot: Json;
  generated_by?: string | null;
  generated_at?: string;
  superseded_at?: string | null;
  invalidated_at?: string | null;
  invalidation_reason?: TicketDocumentInvalidationReasonEnum | null;
  created_at?: string;
  updated_at?: string;
}

export type GraduationTicketDocumentUpdate =
  Partial<GraduationTicketDocumentInsert>;

export type GraduationTicketDocumentBatchRow = {
  id: string;
  event_id: string;
  batch_code: string;
  status: TicketDocumentBatchStatusEnum;
  purpose: TicketDocumentBatchPurposeEnum;
  selected_count: number;
  ready_count: number;
  failed_count: number;
  excluded_count: number;
  manifest_sha256: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  exported_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
}

export type GraduationTicketDocumentBatchInsert = {
  id?: string;
  event_id: string;
  batch_code: string;
  status?: TicketDocumentBatchStatusEnum;
  purpose?: TicketDocumentBatchPurposeEnum;
  selected_count?: number;
  ready_count?: number;
  failed_count?: number;
  excluded_count?: number;
  manifest_sha256?: string | null;
  created_by?: string | null;
  created_at?: string;
  completed_at?: string | null;
  exported_at?: string | null;
  cancelled_at?: string | null;
  updated_at?: string;
}

export type GraduationTicketDocumentBatchUpdate =
  Partial<GraduationTicketDocumentBatchInsert>;

export type GraduationTicketDocumentBatchItemRow = {
  id: string;
  batch_id: string;
  registration_id: string;
  ticket_id: string | null;
  document_id: string | null;
  item_status: TicketDocumentBatchItemStatusEnum;
  exclusion_reason: string | null;
  recipient_name_snapshot: string;
  recipient_email_snapshot: string | null;
  document_version_snapshot: number | null;
  pdf_file_name_snapshot: string | null;
  pdf_sha256_snapshot: string | null;
  party_snapshot: Json;
  created_at: string;
  updated_at: string;
}

export type GraduationTicketDocumentBatchItemInsert = {
  id?: string;
  batch_id: string;
  registration_id: string;
  ticket_id?: string | null;
  document_id?: string | null;
  item_status?: TicketDocumentBatchItemStatusEnum;
  exclusion_reason?: string | null;
  recipient_name_snapshot: string;
  recipient_email_snapshot?: string | null;
  document_version_snapshot?: number | null;
  pdf_file_name_snapshot?: string | null;
  pdf_sha256_snapshot?: string | null;
  party_snapshot?: Json;
  created_at?: string;
  updated_at?: string;
}

export type GraduationTicketDocumentBatchItemUpdate =
  Partial<GraduationTicketDocumentBatchItemInsert>;

// ---------------------------------------------------------------------
// CHECKIN-10B: emergency manual production release.
// ---------------------------------------------------------------------

export type ProductionImportStatusEnum =
  | "uploaded"
  | "preview_ready"
  | "applying"
  | "applied"
  | "cancelled"
  | "failed"
  | "duplicate";

/**
 * The role one workbook row plays inside its reconciled graduate group. A
 * supplemental order is a further guest-payment or guest-update transaction
 * that must be merged into the same graduate, never discarded as a
 * duplicate and never turned into a second registration.
 */
export type ProductionImportOrderRoleEnum =
  | "primary"
  | "supplemental"
  | "duplicate_submission"
  | "excluded";

export type ProductionImportGroupDecisionEnum =
  | "needs_review"
  | "approved"
  | "excluded";

export type ManualDeliveryKindEnum = "initial" | "resend" | "replacement";

export type ProductionRegistrationImportRow = {
  id: string;
  event_id: string;
  original_filename: string;
  file_sha256: string;
  file_size_bytes: number;
  worksheet_name: string;
  status: ProductionImportStatusEnum;
  source_order_count: number;
  graduate_count: number;
  duplicate_submission_count: number;
  supplemental_order_count: number;
  needs_review_count: number;
  excluded_count: number;
  expected_ticket_count: number;
  notices: Json;
  created_by: string | null;
  applied_by: string | null;
  created_at: string;
  applied_at: string | null;
  updated_at: string;
}

export type ProductionRegistrationImportInsert = {
  id?: string;
  event_id: string;
  original_filename: string;
  file_sha256: string;
  file_size_bytes: number;
  worksheet_name: string;
  status?: ProductionImportStatusEnum;
  source_order_count?: number;
  graduate_count?: number;
  duplicate_submission_count?: number;
  supplemental_order_count?: number;
  needs_review_count?: number;
  excluded_count?: number;
  expected_ticket_count?: number;
  notices?: Json;
  created_by?: string | null;
  applied_by?: string | null;
  created_at?: string;
  applied_at?: string | null;
  updated_at?: string;
}

export type ProductionRegistrationImportUpdate =
  Partial<ProductionRegistrationImportInsert>;

export type ProductionImportGraduateRow = {
  id: string;
  import_id: string;
  group_key: string;
  canonical_full_name: string;
  email: string | null;
  phone: string | null;
  gown_size: string | null;
  name_pronunciation: string | null;
  approved_adult_guests: number;
  approved_children_0_4: number;
  approved_children_5_10: number;
  approved_adult_guest_names: Json;
  fee_total: number;
  tax_total: number;
  order_total: number;
  decision: ProductionImportGroupDecisionEnum;
  review_reasons: Json;
  reconciliation_note: string | null;
  primary_source_order_id: string;
  existing_registration_id: string | null;
  applied_registration_id: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ProductionImportGraduateInsert = {
  id?: string;
  import_id: string;
  group_key: string;
  canonical_full_name: string;
  email?: string | null;
  phone?: string | null;
  gown_size?: string | null;
  name_pronunciation?: string | null;
  approved_adult_guests?: number;
  approved_children_0_4?: number;
  approved_children_5_10?: number;
  approved_adult_guest_names?: Json;
  fee_total?: number;
  tax_total?: number;
  order_total?: number;
  decision?: ProductionImportGroupDecisionEnum;
  review_reasons?: Json;
  reconciliation_note?: string | null;
  primary_source_order_id: string;
  existing_registration_id?: string | null;
  applied_registration_id?: string | null;
  applied_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ProductionImportGraduateUpdate =
  Partial<ProductionImportGraduateInsert>;

export type ProductionImportSourceOrderRow = {
  id: string;
  import_id: string;
  graduate_id: string | null;
  source_row_number: number;
  source_order_id: string;
  order_role: ProductionImportOrderRoleEnum;
  graduate_full_name: string | null;
  email: string | null;
  phone: string | null;
  gown_size: string | null;
  name_pronunciation: string | null;
  guest_1_name: string | null;
  guest_2_name: string | null;
  kids_0_4: number;
  kids_5_10: number;
  fee_total: number | null;
  tax_total: number | null;
  order_total: number | null;
  source_note: string | null;
  source_order_status: string | null;
  source_order_date: string | null;
  registration_status: RegistrationStatus;
  payment_status: PaymentStatus;
  validation_errors: Json;
  validation_warnings: Json;
  created_at: string;
  updated_at: string;
}

export type ProductionImportSourceOrderInsert = {
  id?: string;
  import_id: string;
  graduate_id?: string | null;
  source_row_number: number;
  source_order_id: string;
  order_role?: ProductionImportOrderRoleEnum;
  graduate_full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  gown_size?: string | null;
  name_pronunciation?: string | null;
  guest_1_name?: string | null;
  guest_2_name?: string | null;
  kids_0_4?: number;
  kids_5_10?: number;
  fee_total?: number | null;
  tax_total?: number | null;
  order_total?: number | null;
  source_note?: string | null;
  source_order_status?: string | null;
  source_order_date?: string | null;
  registration_status?: RegistrationStatus;
  payment_status?: PaymentStatus;
  validation_errors?: Json;
  validation_warnings?: Json;
  created_at?: string;
  updated_at?: string;
}

export type ProductionImportSourceOrderUpdate =
  Partial<ProductionImportSourceOrderInsert>;

export type RegistrationSourceOrderRow = {
  id: string;
  event_id: string;
  registration_id: string;
  source_order_id: string;
  order_role: ProductionImportOrderRoleEnum;
  source_row_number: number | null;
  import_id: string | null;
  fee_total: number | null;
  tax_total: number | null;
  order_total: number | null;
  source_order_date: string | null;
  source_note: string | null;
  created_at: string;
  updated_at: string;
}

export type RegistrationSourceOrderInsert = {
  id?: string;
  event_id: string;
  registration_id: string;
  source_order_id: string;
  order_role?: ProductionImportOrderRoleEnum;
  source_row_number?: number | null;
  import_id?: string | null;
  fee_total?: number | null;
  tax_total?: number | null;
  order_total?: number | null;
  source_order_date?: string | null;
  source_note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type RegistrationSourceOrderUpdate =
  Partial<RegistrationSourceOrderInsert>;

/**
 * Append-only ledger of manual Gmail sends. Rows are inserted only through
 * record_manual_ticket_send; a database trigger blocks updates and deletes,
 * so the Update shape exists purely to satisfy the client generic.
 */
export type GraduationManualTicketSendRow = {
  id: string;
  event_id: string;
  registration_id: string;
  ticket_id: string | null;
  document_id: string | null;
  attempt_number: number;
  send_kind: ManualDeliveryKindEnum;
  idempotency_key: string;
  intended_recipient_snapshot: string;
  actual_recipient_snapshot: string | null;
  mode: TicketDeliveryModeEnum;
  provider: string;
  outcome: string;
  ticket_code_snapshot: string;
  pdf_file_name_snapshot: string | null;
  document_version_snapshot: number | null;
  party_snapshot: Json;
  reason: string | null;
  note: string | null;
  gmail_message_id: string | null;
  sent_at: string;
  recorded_by: string | null;
  created_at: string;
}

export type GraduationManualTicketSendInsert = {
  id?: string;
  event_id: string;
  registration_id: string;
  ticket_id?: string | null;
  document_id?: string | null;
  attempt_number: number;
  send_kind?: ManualDeliveryKindEnum;
  idempotency_key: string;
  intended_recipient_snapshot: string;
  actual_recipient_snapshot?: string | null;
  mode?: TicketDeliveryModeEnum;
  provider?: string;
  outcome?: string;
  ticket_code_snapshot: string;
  pdf_file_name_snapshot?: string | null;
  document_version_snapshot?: number | null;
  party_snapshot?: Json;
  reason?: string | null;
  note?: string | null;
  gmail_message_id?: string | null;
  sent_at?: string;
  recorded_by?: string | null;
  created_at?: string;
}

export type GraduationManualTicketSendUpdate =
  Partial<GraduationManualTicketSendInsert>;

export type GraduateRosterCandidateRow = {
  id: string;
  event_id: string;
  student_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  program: string | null;
  batch: string | null;
  registration_id: string | null;
  internal_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type GraduateRosterCandidateInsert = {
  id?: string;
  event_id: string;
  student_id?: string | null;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  program?: string | null;
  batch?: string | null;
  registration_id?: string | null;
  internal_notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type GraduateRosterCandidateUpdate =
  Partial<GraduateRosterCandidateInsert>;

export type GraduationPartyAdjustmentRow = {
  id: string;
  event_id: string;
  registration_id: string;
  ticket_id: string | null;
  idempotency_key: string;
  reason: string;
  payment_note: string | null;
  before_party: Json;
  after_party: Json;
  changed_by: string | null;
  changed_at: string;
};

export type GraduationPartyAdjustmentInsert = {
  id?: string;
  event_id: string;
  registration_id: string;
  ticket_id?: string | null;
  idempotency_key: string;
  reason: string;
  payment_note?: string | null;
  before_party: Json;
  after_party: Json;
  changed_by?: string | null;
  changed_at?: string;
};

export type GraduationPartyAdjustmentUpdate =
  Partial<GraduationPartyAdjustmentInsert>;

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
      ticket_generation_batches: {
        Row: TicketGenerationBatchRow;
        Insert: TicketGenerationBatchInsert;
        Update: TicketGenerationBatchUpdate;
        Relationships: [];
      };
      ticket_activity_log: {
        Row: TicketActivityLogRow;
        Insert: TicketActivityLogInsert;
        Update: TicketActivityLogUpdate;
        Relationships: [];
      };
      staff_profiles: {
        Row: StaffProfileRow;
        Insert: StaffProfileInsert;
        Update: StaffProfileUpdate;
        Relationships: [];
      };
      staff_access_audit_log: {
        Row: StaffAccessAuditLogRow;
        Insert: StaffAccessAuditLogInsert;
        Update: StaffAccessAuditLogUpdate;
        Relationships: [];
      };
      graduation_checkins: {
        Row: GraduationCheckinRow;
        Insert: GraduationCheckinInsert;
        Update: GraduationCheckinUpdate;
        Relationships: [];
      };
      ticket_scan_attempts: {
        Row: TicketScanAttemptRow;
        Insert: TicketScanAttemptInsert;
        Update: TicketScanAttemptUpdate;
        Relationships: [];
      };
      registration_imports: {
        Row: RegistrationImportRow;
        Insert: RegistrationImportInsert;
        Update: RegistrationImportUpdate;
        Relationships: [];
      };
      graduation_event_ticket_settings: {
        Row: GraduationEventTicketSettingsRow;
        Insert: GraduationEventTicketSettingsInsert;
        Update: GraduationEventTicketSettingsUpdate;
        Relationships: [];
      };
      graduation_ticket_documents: {
        Row: GraduationTicketDocumentRow;
        Insert: GraduationTicketDocumentInsert;
        Update: GraduationTicketDocumentUpdate;
        Relationships: [];
      };
      graduation_ticket_document_batches: {
        Row: GraduationTicketDocumentBatchRow;
        Insert: GraduationTicketDocumentBatchInsert;
        Update: GraduationTicketDocumentBatchUpdate;
        Relationships: [];
      };
      graduation_ticket_document_batch_items: {
        Row: GraduationTicketDocumentBatchItemRow;
        Insert: GraduationTicketDocumentBatchItemInsert;
        Update: GraduationTicketDocumentBatchItemUpdate;
        Relationships: [];
      };
      registration_import_rows: {
        Row: RegistrationImportRowRow;
        Insert: RegistrationImportRowInsert;
        Update: RegistrationImportRowUpdate;
        Relationships: [];
      };
      graduation_ticket_delivery_batches: {
        Row: GraduationTicketDeliveryBatchRow;
        Insert: GraduationTicketDeliveryBatchInsert;
        Update: GraduationTicketDeliveryBatchUpdate;
        Relationships: [];
      };
      graduation_ticket_deliveries: {
        Row: GraduationTicketDeliveryRow;
        Insert: GraduationTicketDeliveryInsert;
        Update: GraduationTicketDeliveryUpdate;
        Relationships: [];
      };
      graduation_ticket_delivery_attempts: {
        Row: GraduationTicketDeliveryAttemptRow;
        Insert: GraduationTicketDeliveryAttemptInsert;
        Update: GraduationTicketDeliveryAttemptUpdate;
        Relationships: [];
      };
      graduation_ticket_delivery_result_imports: {
        Row: GraduationTicketDeliveryResultImportRow;
        Insert: GraduationTicketDeliveryResultImportInsert;
        Update: GraduationTicketDeliveryResultImportUpdate;
        Relationships: [];
      };
      graduation_ticket_delivery_result_import_rows: {
        Row: GraduationTicketDeliveryResultImportLineRow;
        Insert: GraduationTicketDeliveryResultImportLineInsert;
        Update: GraduationTicketDeliveryResultImportLineUpdate;
        Relationships: [];
      };
      production_registration_imports: {
        Row: ProductionRegistrationImportRow;
        Insert: ProductionRegistrationImportInsert;
        Update: ProductionRegistrationImportUpdate;
        Relationships: [];
      };
      production_import_graduates: {
        Row: ProductionImportGraduateRow;
        Insert: ProductionImportGraduateInsert;
        Update: ProductionImportGraduateUpdate;
        Relationships: [];
      };
      production_import_source_orders: {
        Row: ProductionImportSourceOrderRow;
        Insert: ProductionImportSourceOrderInsert;
        Update: ProductionImportSourceOrderUpdate;
        Relationships: [];
      };
      registration_source_orders: {
        Row: RegistrationSourceOrderRow;
        Insert: RegistrationSourceOrderInsert;
        Update: RegistrationSourceOrderUpdate;
        Relationships: [];
      };
      graduation_manual_ticket_sends: {
        Row: GraduationManualTicketSendRow;
        Insert: GraduationManualTicketSendInsert;
        Update: GraduationManualTicketSendUpdate;
        Relationships: [];
      };
      graduate_roster_candidates: {
        Row: GraduateRosterCandidateRow;
        Insert: GraduateRosterCandidateInsert;
        Update: GraduateRosterCandidateUpdate;
        Relationships: [];
      };
      graduation_party_adjustments: {
        Row: GraduationPartyAdjustmentRow;
        Insert: GraduationPartyAdjustmentInsert;
        Update: GraduationPartyAdjustmentUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      update_graduation_registration_party: {
        Args: {
          p_actor_user_id: string;
          p_registration_id: string;
          p_adult_guest_count: number;
          p_adult_guest_names: Json;
          p_children_0_4: number;
          p_children_5_10: number;
          p_reason: string;
          p_payment_note: string | null;
          p_idempotency_key: string;
          p_expected_updated_at: string | null;
        };
        Returns: Json;
      };
      apply_production_registration_import: {
        Args: { p_import_id: string; p_applied_by: string | null };
        Returns: Json;
      };
      record_manual_ticket_send: {
        Args: {
          p_registration_id: string;
          p_ticket_id: string;
          p_document_id: string | null;
          p_send_kind: ManualDeliveryKindEnum;
          p_idempotency_key: string;
          p_intended_recipient: string;
          p_actual_recipient: string | null;
          p_reason: string | null;
          p_note: string | null;
          p_gmail_message_id: string | null;
          p_recorded_by: string | null;
        };
        Returns: Json;
      };
      record_ticket_delivery_attempt: {
        Args: {
          p_actor_user_id: string;
          p_delivery_id: string;
          p_result_import_id: string | null;
          p_attempt_reference: string;
          p_attempt_mode: TicketDeliveryModeEnum;
          p_outcome: TicketDeliveryAttemptOutcomeEnum;
          p_intended_recipient: string;
          p_actual_recipient: string | null;
          p_attempted_at: string;
          p_sent_by: string | null;
          p_provider: string | null;
          p_error_code: string | null;
          p_error_message: string | null;
          p_source_row_hash: string | null;
          p_new_delivery_status: TicketDeliveryStatusEnum | null;
        };
        Returns: Json;
      };
      cancel_ticket_delivery_batch: {
        Args: {
          p_actor_user_id: string;
          p_batch_id: string;
        };
        Returns: Json;
      };
      apply_graduation_checkin: {
        Args: {
          p_actor_user_id: string;
          p_event_id: string;
          p_validation_attempt_id: string;
          p_request_id: string;
          p_graduate_arriving: number;
          p_adult_guests_arriving: number;
          p_children_0_4_arriving: number;
          p_children_5_10_arriving: number;
        };
        Returns: Json;
      };
      apply_manual_graduation_arrival: {
        Args: {
          p_actor_user_id: string;
          p_event_id: string;
          p_registration_id: string;
          p_request_id: string;
          p_graduate_arriving: number;
          p_adult_guests_arriving: number;
          p_children_0_4_arriving: number;
          p_children_5_10_arriving: number;
          p_reason: string;
        };
        Returns: Json;
      };
      apply_attendance_correction: {
        Args: {
          p_actor_user_id: string;
          p_event_id: string;
          p_registration_id: string;
          p_request_id: string;
          p_graduate_delta: number;
          p_adult_guest_delta: number;
          p_child_0_4_delta: number;
          p_child_5_10_delta: number;
          p_reason: string;
        };
        Returns: Json;
      };
      reverse_graduation_checkin: {
        Args: {
          p_actor_user_id: string;
          p_event_id: string;
          p_original_checkin_id: string;
          p_request_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      apply_registration_import: {
        Args: { p_import_id: string };
        Returns: Json;
      };
      apply_staff_access_change: {
        Args: {
          p_actor_user_id: string;
          p_target_user_id: string;
          p_new_role: StaffRole;
          p_new_is_active: boolean;
        };
        Returns: Json;
      };
      apply_ticket_generation_batch: {
        Args: {
          p_actor_user_id: string;
          p_event_id: string;
          p_idempotency_key: string;
          p_request_id: string;
          p_items: Json;
        };
        Returns: Json;
      };
      replace_graduation_ticket: {
        Args: {
          p_actor_user_id: string;
          p_ticket_id: string;
          p_new_ticket_id: string;
          p_new_ticket_code: string;
          p_new_token_hash: string;
          p_new_token_version: number;
          p_reason: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      revoke_graduation_ticket: {
        Args: {
          p_actor_user_id: string;
          p_ticket_id: string;
          p_reason: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      finalize_graduation_ticket_document: {
        Args: {
          p_actor_user_id: string;
          p_ticket_id: string;
          p_document_id: string;
          p_template_version: number;
          p_storage_bucket: string;
          p_storage_path: string;
          p_file_name: string;
          p_file_size_bytes: number;
          p_sha256_checksum: string;
          p_source_fingerprint: string;
          p_graduate_name_snapshot: string;
          p_ticket_code_snapshot: string;
          p_registered_party_snapshot: Json;
          p_event_snapshot: Json;
        };
        Returns: Json;
      };
      invalidate_graduation_ticket_documents: {
        Args: {
          p_actor_user_id: string;
          p_ticket_id: string;
          p_reason: TicketDocumentInvalidationReasonEnum;
        };
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
      ticket_generation_batch_status: TicketGenerationBatchStatus;
      ticket_activity_action: TicketActivityAction;
      staff_role: StaffRole;
      staff_access_action: StaffAccessAction;
      checkin_method: CheckinMethod;
      checkin_action: CheckinAction;
      attendance_entry_kind: AttendanceEntryKind;
      ticket_scan_method: TicketScanMethod;
      ticket_validation_result: TicketValidationResult;
      registration_import_status: RegistrationImportStatus;
      registration_import_row_result: RegistrationImportRowResult;
      ticket_document_status: TicketDocumentStatusEnum;
      ticket_document_invalidation_reason: TicketDocumentInvalidationReasonEnum;
      ticket_document_batch_status: TicketDocumentBatchStatusEnum;
      ticket_document_batch_purpose: TicketDocumentBatchPurposeEnum;
      ticket_document_batch_item_status: TicketDocumentBatchItemStatusEnum;
      production_import_status: ProductionImportStatusEnum;
      production_import_order_role: ProductionImportOrderRoleEnum;
      production_import_group_decision: ProductionImportGroupDecisionEnum;
      manual_delivery_kind: ManualDeliveryKindEnum;
    };
    CompositeTypes: Record<string, never>;
  };
}
