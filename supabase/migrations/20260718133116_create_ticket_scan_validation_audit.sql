-- CHECKIN-06: privacy-safe ticket scan validation audit.
--
-- Adds the scan-method and validation-result enums plus the
-- ticket_scan_attempts table that records every server-side ticket
-- validation attempt made by staff from the mobile scanner.
--
-- Privacy design: a scan attempt stores identifiers, enum results and
-- numeric attendance snapshots only. It never stores a QR payload, a raw
-- ticket token, a token hash, a ticket code, a graduate name, an email,
-- a phone number, a guest name or any payment information. Raw tokens are
-- never stored anywhere in this schema.
--
-- This migration is additive only. It never drops, deletes or modifies
-- previously deployed objects.

-- Enum: how the staff member supplied the ticket value.
create type public.ticket_scan_method as enum (
  'qr',
  'manual_code'
);

-- Enum: the server-side outcome of one validation attempt.
create type public.ticket_validation_result as enum (
  'valid',
  'partially_checked_in',
  'already_checked_in',
  'invalid',
  'revoked',
  'replaced',
  'pending',
  'wrong_event',
  'registration_blocked',
  'rate_limited',
  'error'
);

-- Table: one row per server validation response.
--
-- event_id, ticket_id and registration_id are nullable because rate
-- limiting and invalid or unrecognized values are audited before a ticket,
-- registration or even the configured event can be resolved.
create table public.ticket_scan_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.graduation_events (id),
  ticket_id uuid references public.graduation_tickets (id),
  registration_id uuid references public.graduation_registrations (id),
  staff_user_id uuid not null references auth.users (id),
  method public.ticket_scan_method not null,
  result public.ticket_validation_result not null,
  request_id uuid not null,
  ticket_status_snapshot public.ticket_status,
  registration_status_snapshot public.registration_status,
  graduate_arrived_snapshot smallint,
  adult_guests_arrived_snapshot smallint,
  children_0_4_arrived_snapshot smallint,
  children_5_10_arrived_snapshot smallint,
  created_at timestamptz not null default now(),
  constraint ticket_scan_attempts_request_id_unique unique (
    staff_user_id,
    request_id
  ),
  constraint ticket_scan_attempts_graduate_snapshot_nonnegative check (
    graduate_arrived_snapshot is null or graduate_arrived_snapshot >= 0
  ),
  constraint ticket_scan_attempts_adult_snapshot_nonnegative check (
    adult_guests_arrived_snapshot is null
    or adult_guests_arrived_snapshot >= 0
  ),
  constraint ticket_scan_attempts_child_0_4_snapshot_nonnegative check (
    children_0_4_arrived_snapshot is null
    or children_0_4_arrived_snapshot >= 0
  ),
  constraint ticket_scan_attempts_child_5_10_snapshot_nonnegative check (
    children_5_10_arrived_snapshot is null
    or children_5_10_arrived_snapshot >= 0
  )
);

comment on table public.ticket_scan_attempts is
  'Privacy-safe validation audit records for the staff ticket scanner. A row records that a staff member asked the server to validate a ticket value and what the outcome was. A scan attempt does not represent admission; attendance is recorded separately in graduation_checkins. Rows never contain QR payloads, raw tokens, token hashes, ticket codes, graduate names, emails, phone numbers, guest names or payment information. Retention should be reviewed after the event; this table must never become a source of ticket-token or student-contact data.';

comment on column public.ticket_scan_attempts.request_id is
  'Client-generated UUID for one validation action. Unique per staff user so duplicate submissions of the same action stay idempotent.';

comment on column public.ticket_scan_attempts.ticket_status_snapshot is
  'Ticket status at validation time. Null when no ticket was resolved.';

comment on column public.ticket_scan_attempts.registration_status_snapshot is
  'Registration status at validation time. Null when no registration was resolved.';

comment on column public.ticket_scan_attempts.graduate_arrived_snapshot is
  'Clamped registration-level graduate attendance at validation time. Snapshots are cumulative across all graduation_checkins of the registration, never only the scanned ticket.';

create index ticket_scan_attempts_staff_idx
  on public.ticket_scan_attempts (staff_user_id);
create index ticket_scan_attempts_event_idx
  on public.ticket_scan_attempts (event_id);
create index ticket_scan_attempts_ticket_idx
  on public.ticket_scan_attempts (ticket_id);
create index ticket_scan_attempts_registration_idx
  on public.ticket_scan_attempts (registration_id);
create index ticket_scan_attempts_result_idx
  on public.ticket_scan_attempts (result);
create index ticket_scan_attempts_created_at_idx
  on public.ticket_scan_attempts (created_at);

-- Row Level Security: enabled with no policies, so anon and authenticated
-- roles can never read or write scan attempts. Direct table privileges are
-- also revoked. Access remains through trusted server-side code using the
-- service role only.
alter table public.ticket_scan_attempts enable row level security;

revoke all on table public.ticket_scan_attempts from anon, authenticated;
