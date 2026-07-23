-- CHECKIN-10A: production cutover controls.
--
-- This migration is additive only. It never drops, deletes, renames or alters
-- a previously deployed object, and it never updates or deletes an existing
-- row. It does not touch graduation_tickets, graduation_checkins,
-- registration_guests, graduation_ticket_documents, the delivery attempt log
-- or any earlier delivery object. The scanner protocol, QR payload,
-- ticket-token format, attendance meaning, replacement logic, revocation
-- logic and the CHECKIN-09B/09C importer are all unchanged.
--
-- What this adds:
--   1. graduation_ticket_external_deliveries
--      A record that a graduate was given their ticket outside this system
--      (forwarded by hand, sent from a personal inbox before this workflow
--      existed). It is deliberately NOT a send attempt: it creates no row in
--      graduation_ticket_delivery_attempts, so the application never pretends
--      it sent an email it did not send. It exists so the production
--      eligibility preview can exclude that graduate from an initial batch
--      while still allowing an intentional resend later.
--   2. graduation_ticket_delivery_batches.purpose_reason
--      A nullable column recording why a resend or replacement batch was
--      prepared. Adding a nullable column changes no existing row.
--
-- Privacy: an external-delivery record stores a registration reference, a
-- document/ticket reference the administrator already knows, a date, a
-- channel and a free-text note. It never stores a raw QR token, a token hash,
-- the ticket-signing secret or a row signature. RLS is enabled with no policy,
-- matching the existing service-role-only convention; scanner and supervisor
-- roles have no access.

-- ---------------------------------------------------------------------
-- 1. graduation_ticket_external_deliveries
-- ---------------------------------------------------------------------

create table if not exists public.graduation_ticket_external_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete cascade,
  registration_id uuid not null
    references public.graduation_registrations (id) on delete cascade,
  ticket_id uuid references public.graduation_tickets (id) on delete set null,
  document_reference text not null default '',
  previous_send_date date not null,
  channel text not null,
  note text not null default '',
  recorded_by uuid references auth.users (id),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint graduation_ticket_external_deliveries_channel_valid check (
    channel in (
      'personal_email',
      'office_email',
      'printed_handout',
      'messaging_app',
      'other'
    )
  ),
  constraint graduation_ticket_external_deliveries_reference_length check (
    char_length(document_reference) <= 120
  ),
  constraint graduation_ticket_external_deliveries_note_length check (
    char_length(note) <= 1000
  )
);

comment on table public.graduation_ticket_external_deliveries is
  'Administrator record that a ticket reached a graduate outside this system. Never a send attempt: it creates no delivery attempt and claims no application send. Influences initial-batch eligibility only.';
comment on column public.graduation_ticket_external_deliveries.channel is
  'How the ticket previously reached the graduate. Free text is confined to note.';

create index if not exists graduation_ticket_external_deliveries_event_idx
  on public.graduation_ticket_external_deliveries (event_id);
create index if not exists graduation_ticket_external_deliveries_registration_idx
  on public.graduation_ticket_external_deliveries (registration_id);

alter table public.graduation_ticket_external_deliveries
  enable row level security;

revoke all on table public.graduation_ticket_external_deliveries
  from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Batch purpose reason (additive nullable column)
-- ---------------------------------------------------------------------
--
-- A resend or replacement batch must say why it exists. The column is
-- nullable so every previously prepared batch keeps its exact stored values.

alter table public.graduation_ticket_delivery_batches
  add column if not exists purpose_reason text;

comment on column public.graduation_ticket_delivery_batches.purpose_reason is
  'Administrator reason recorded when a resend or replacement batch is prepared. Null for initial batches prepared before CHECKIN-10A.';
