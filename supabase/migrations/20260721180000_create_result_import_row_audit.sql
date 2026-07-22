-- CHECKIN-09C: per-row result-import audit.
--
-- This migration is additive only. It never drops, deletes, renames or alters
-- a previously deployed object and never updates or deletes an existing row.
-- It does not touch graduation_tickets, graduation_checkins,
-- registration_guests, graduation_ticket_documents or any earlier delivery
-- object. The scanner protocol, QR payload, ticket-token format, attendance
-- meaning, replacement logic and the CHECKIN-09B importer are all unchanged.
--
-- Why this table exists: the CHECKIN-09B importer evaluated every source row
-- (accepted, duplicate, warning, rejected) but only persisted the accepted and
-- warning attempts. A rejected row therefore disappeared after import. The
-- Distribution Control Centre must keep every disposition visible, including
-- rejected rows, which remain recorded but unapplied. This table stores one
-- audit row per evaluated source row so the import history can show the full
-- disposition breakdown without re-uploading the file.
--
-- Privacy: a line stores presentation references and the disposition reason
-- only. It never stores a raw QR token, token hash, ticket-signing secret or
-- row signature. RLS is enabled with no policy, matching the existing
-- service-role-only convention; scanner and supervisor roles have no access.

create table if not exists public.graduation_ticket_delivery_result_import_rows (
  id uuid primary key default gen_random_uuid(),
  result_import_id uuid not null
    references public.graduation_ticket_delivery_result_imports (id)
    on delete cascade,
  delivery_batch_id uuid not null
    references public.graduation_ticket_delivery_batches (id) on delete cascade,
  row_number integer not null,
  delivery_reference text not null default '',
  attempt_reference text not null default '',
  disposition text not null,
  mode text,
  outcome text,
  reason_code text,
  message text not null default '',
  created_at timestamptz not null default now(),
  constraint graduation_ticket_delivery_result_import_rows_disposition_valid check (
    disposition in ('accepted', 'duplicate', 'warning', 'rejected')
  ),
  constraint graduation_ticket_delivery_result_import_rows_row_number_positive check (
    row_number > 0
  )
);

comment on table public.graduation_ticket_delivery_result_import_rows is
  'One audit row per evaluated result-import source row. Rejected rows stay visible but unapplied. Stores no token, hash or signature.';

create index if not exists graduation_ticket_delivery_result_import_rows_import_idx
  on public.graduation_ticket_delivery_result_import_rows (result_import_id);
create index if not exists graduation_ticket_delivery_result_import_rows_batch_idx
  on public.graduation_ticket_delivery_result_import_rows (delivery_batch_id);

alter table public.graduation_ticket_delivery_result_import_rows
  enable row level security;

revoke all on table public.graduation_ticket_delivery_result_import_rows
  from anon, authenticated;
