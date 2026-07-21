-- CHECKIN-09B: ticket-distribution delivery records for Google Apps Script.
--
-- This migration is additive only. It never drops, deletes, renames or
-- alters previously deployed objects and never updates or deletes an
-- existing row. It does not touch graduation_tickets, graduation_checkins,
-- registration_guests, graduation_ticket_documents or any earlier object.
-- The scanner protocol, QR payload format, ticket-token format, attendance
-- meaning, replacement logic and revocation logic are all unchanged.
--
-- What this adds (the app prepares and records deliveries; it never sends
-- email — Google Apps Script sends, and its results are imported back):
--   1. graduation_ticket_delivery_batches        delivery batch headers.
--   2. graduation_ticket_deliveries              per-registration deliveries.
--   3. graduation_ticket_delivery_attempts       append-only attempt log.
--   4. graduation_ticket_delivery_result_imports imported results files.
--   5. record_ticket_delivery_attempt()          idempotent attempt append.
--   6. cancel_ticket_delivery_batch()            cancel an unsent batch.
--
-- Privacy and credentials: a delivery row snapshots presentation and
-- recipient data only. It never stores a raw QR token, a token hash or the
-- ticket-signing secret. The row_signature it stores is an HMAC created by
-- the app with the separate TICKET_DISTRIBUTION_SECRET; that value is not a
-- credential and cannot mint an admission token. Every table below is
-- deny-by-default with RLS enabled and no policies, matching the existing
-- service-role-only access convention. Scanner and supervisor roles have no
-- access; only service-role and approved administrator server routes do.

-- ---------------------------------------------------------------------
-- 1. Enumerations
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ticket_delivery_mode') then
    create type public.ticket_delivery_mode as enum ('test', 'production');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ticket_delivery_purpose') then
    create type public.ticket_delivery_purpose as enum (
      'initial',
      'updated',
      'replacement',
      'resend'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'ticket_delivery_batch_status'
  ) then
    create type public.ticket_delivery_batch_status as enum (
      'draft',
      'prepared',
      'sending',
      'partial',
      'completed',
      'failed',
      'cancelled'
    );
  end if;
end
$$;

-- There is deliberately no inbox-delivery status: an Apps Script send
-- success does not prove the message reached an inbox.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ticket_delivery_status') then
    create type public.ticket_delivery_status as enum (
      'prepared',
      'sent',
      'failed',
      'bounce_detected',
      'resend_required',
      'resent',
      'cancelled',
      'suppressed'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'ticket_delivery_attempt_outcome'
  ) then
    create type public.ticket_delivery_attempt_outcome as enum (
      'sent',
      'failed',
      'bounce_detected',
      'skipped',
      'cancelled'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'ticket_delivery_result_import_status'
  ) then
    create type public.ticket_delivery_result_import_status as enum (
      'uploaded',
      'previewed',
      'applied',
      'rejected'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 2. graduation_ticket_delivery_batches
-- ---------------------------------------------------------------------

create table if not exists public.graduation_ticket_delivery_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete cascade,
  document_batch_id uuid
    references public.graduation_ticket_document_batches (id) on delete set null,
  delivery_batch_code text not null,
  mode public.ticket_delivery_mode not null,
  purpose public.ticket_delivery_purpose not null default 'initial',
  status public.ticket_delivery_batch_status not null default 'draft',
  prepared_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  bounced_count integer not null default 0,
  resend_required_count integer not null default 0,
  cancelled_count integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  prepared_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  source_manifest_sha256 text,
  results_imported_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint graduation_ticket_delivery_batches_code_unique unique (
    delivery_batch_code
  ),
  constraint graduation_ticket_delivery_batches_code_format check (
    delivery_batch_code ~ '^[A-Z0-9-]{6,40}$'
  ),
  constraint graduation_ticket_delivery_batches_counts_not_negative check (
    prepared_count >= 0
    and sent_count >= 0
    and failed_count >= 0
    and bounced_count >= 0
    and resend_required_count >= 0
    and cancelled_count >= 0
  ),
  -- Mirrors the application ceiling so an oversized batch cannot exist even
  -- if an application check is bypassed.
  constraint graduation_ticket_delivery_batches_max_size check (
    prepared_count <= 50
  ),
  constraint graduation_ticket_delivery_batches_manifest_format check (
    source_manifest_sha256 is null
      or source_manifest_sha256 ~ '^[0-9a-f]{64}$'
  )
);

comment on table public.graduation_ticket_delivery_batches is
  'Delivery batch headers. The app prepares and records; Google Apps Script sends. No delivered status exists because send success is not inbox delivery.';
comment on column public.graduation_ticket_delivery_batches.mode is
  'test never reaches a graduate inbox; production is the real send.';

create index if not exists graduation_ticket_delivery_batches_event_idx
  on public.graduation_ticket_delivery_batches (event_id);
create index if not exists graduation_ticket_delivery_batches_status_idx
  on public.graduation_ticket_delivery_batches (status);
create index if not exists graduation_ticket_delivery_batches_document_batch_idx
  on public.graduation_ticket_delivery_batches (document_batch_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'graduation_ticket_delivery_batches_set_updated_at'
  ) then
    create trigger graduation_ticket_delivery_batches_set_updated_at
      before update on public.graduation_ticket_delivery_batches
      for each row execute function public.set_updated_at();
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 3. graduation_ticket_deliveries
-- ---------------------------------------------------------------------
--
-- One row per registration prepared for delivery. The snapshots freeze what
-- was prepared so a later registration edit never rewrites a delivery. The
-- row_signature proves the app prepared this exact row.

create table if not exists public.graduation_ticket_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete cascade,
  delivery_batch_id uuid not null
    references public.graduation_ticket_delivery_batches (id) on delete cascade,
  registration_id uuid not null
    references public.graduation_registrations (id) on delete cascade,
  ticket_id uuid references public.graduation_tickets (id) on delete set null,
  document_id uuid
    references public.graduation_ticket_documents (id) on delete set null,
  delivery_reference text not null,
  recipient_name_snapshot text not null,
  recipient_email_snapshot text not null,
  ticket_code_snapshot text not null,
  document_version_snapshot integer not null,
  pdf_file_name_snapshot text not null,
  pdf_sha256_snapshot text not null,
  party_snapshot jsonb not null default '{}'::jsonb,
  row_signature text not null,
  status public.ticket_delivery_status not null default 'prepared',
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  first_sent_at timestamptz,
  latest_sent_at timestamptz,
  bounced_at timestamptz,
  resend_required_at timestamptz,
  cancelled_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint graduation_ticket_deliveries_reference_unique unique (
    delivery_reference
  ),
  constraint graduation_ticket_deliveries_reference_format check (
    delivery_reference ~ '^[A-Z0-9-]{8,60}$'
  ),
  constraint graduation_ticket_deliveries_sha_format check (
    pdf_sha256_snapshot ~ '^[0-9a-f]{64}$'
  ),
  constraint graduation_ticket_deliveries_party_is_object check (
    jsonb_typeof(party_snapshot) = 'object'
  ),
  constraint graduation_ticket_deliveries_version_positive check (
    document_version_snapshot > 0
  ),
  constraint graduation_ticket_deliveries_attempt_count_not_negative check (
    attempt_count >= 0
  )
);

comment on table public.graduation_ticket_deliveries is
  'Per-registration delivery snapshots. Never stores a raw QR token, token hash or ticket-signing secret. Recipient email is administrator-only.';
comment on column public.graduation_ticket_deliveries.row_signature is
  'HMAC created by the app with TICKET_DISTRIBUTION_SECRET. Not a credential; proves the delivery row was prepared by the app and not altered before import.';

-- One live delivery per registration per batch, so a batch can never queue
-- the same graduate twice.
create unique index if not exists graduation_ticket_deliveries_batch_registration_unique
  on public.graduation_ticket_deliveries (delivery_batch_id, registration_id);

create index if not exists graduation_ticket_deliveries_event_idx
  on public.graduation_ticket_deliveries (event_id);
create index if not exists graduation_ticket_deliveries_batch_idx
  on public.graduation_ticket_deliveries (delivery_batch_id);
create index if not exists graduation_ticket_deliveries_registration_idx
  on public.graduation_ticket_deliveries (registration_id);
create index if not exists graduation_ticket_deliveries_status_idx
  on public.graduation_ticket_deliveries (status);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'graduation_ticket_deliveries_set_updated_at'
  ) then
    create trigger graduation_ticket_deliveries_set_updated_at
      before update on public.graduation_ticket_deliveries
      for each row execute function public.set_updated_at();
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 4. graduation_ticket_delivery_result_imports
-- ---------------------------------------------------------------------
--
-- One row per uploaded Apps Script results file. The file checksum makes a
-- re-upload of the same file detectable and the whole import idempotent.

create table if not exists public.graduation_ticket_delivery_result_imports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete cascade,
  delivery_batch_id uuid not null
    references public.graduation_ticket_delivery_batches (id) on delete cascade,
  file_name text not null,
  file_sha256 text not null,
  status public.ticket_delivery_result_import_status not null default 'uploaded',
  total_rows integer not null default 0,
  accepted_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  warning_rows integer not null default 0,
  rejected_rows integer not null default 0,
  imported_by uuid references auth.users (id),
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  constraint graduation_ticket_delivery_result_imports_sha_format check (
    file_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint graduation_ticket_delivery_result_imports_counts_not_negative check (
    total_rows >= 0
    and accepted_rows >= 0
    and duplicate_rows >= 0
    and warning_rows >= 0
    and rejected_rows >= 0
  )
);

comment on table public.graduation_ticket_delivery_result_imports is
  'Uploaded Apps Script results files. A re-import of the same file is idempotent because the checksum and per-attempt references are unique.';

create index if not exists graduation_ticket_delivery_result_imports_batch_idx
  on public.graduation_ticket_delivery_result_imports (delivery_batch_id);
create unique index if not exists graduation_ticket_delivery_result_imports_applied_file_unique
  on public.graduation_ticket_delivery_result_imports (delivery_batch_id, file_sha256)
  where status = 'applied';

-- ---------------------------------------------------------------------
-- 5. graduation_ticket_delivery_attempts
-- ---------------------------------------------------------------------
--
-- Append-only. A row is never updated or deleted; the unique attempt
-- reference makes re-importing the same result idempotent. Both the
-- intended and actual recipient are recorded so a test send is auditable.

create table if not exists public.graduation_ticket_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null
    references public.graduation_ticket_deliveries (id) on delete cascade,
  result_import_id uuid
    references public.graduation_ticket_delivery_result_imports (id)
    on delete set null,
  attempt_reference text not null,
  attempt_number integer not null,
  intended_recipient_snapshot text not null,
  actual_recipient_snapshot text,
  mode public.ticket_delivery_mode not null,
  outcome public.ticket_delivery_attempt_outcome not null,
  attempted_at timestamptz not null,
  sent_by text,
  provider text,
  error_code text,
  error_message text,
  source_row_hash text,
  created_at timestamptz not null default now(),
  constraint graduation_ticket_delivery_attempts_reference_unique unique (
    attempt_reference
  ),
  constraint graduation_ticket_delivery_attempts_number_positive check (
    attempt_number > 0
  )
);

comment on table public.graduation_ticket_delivery_attempts is
  'Append-only send-attempt history. Never updated after insertion; a duplicate attempt_reference is a re-import, not a new attempt.';

create index if not exists graduation_ticket_delivery_attempts_delivery_idx
  on public.graduation_ticket_delivery_attempts (delivery_id);
create index if not exists graduation_ticket_delivery_attempts_import_idx
  on public.graduation_ticket_delivery_attempts (result_import_id);

-- Block any UPDATE or DELETE on the attempt log so history stays immutable.
create or replace function public.guard_ticket_delivery_attempt_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception
    'graduation_ticket_delivery_attempts is append-only'
    using errcode = 'check_violation';
  return null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'graduation_ticket_delivery_attempts_guard_append_only'
  ) then
    create trigger graduation_ticket_delivery_attempts_guard_append_only
      before update or delete on public.graduation_ticket_delivery_attempts
      for each row
      execute function public.guard_ticket_delivery_attempt_append_only();
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 6. record_ticket_delivery_attempt()
-- ---------------------------------------------------------------------
--
-- The only supported way to append an attempt and advance a delivery. The
-- delivery is locked FOR UPDATE so concurrent imports serialize, and the
-- unique attempt_reference makes a replayed result a no-op duplicate rather
-- than a new attempt. The caller (the app) decides the delivery status
-- after the attempt; a test attempt passes p_new_delivery_status null so a
-- production delivery is never marked sent by a test.

create or replace function public.record_ticket_delivery_attempt(
  p_actor_user_id uuid,
  p_delivery_id uuid,
  p_result_import_id uuid,
  p_attempt_reference text,
  p_attempt_mode public.ticket_delivery_mode,
  p_outcome public.ticket_delivery_attempt_outcome,
  p_intended_recipient text,
  p_actual_recipient text,
  p_attempted_at timestamptz,
  p_sent_by text,
  p_provider text,
  p_error_code text,
  p_error_message text,
  p_source_row_hash text,
  p_new_delivery_status public.ticket_delivery_status
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_delivery record;
  v_next_number integer;
begin
  select exists (
    select 1
    from public.staff_profiles
    where user_id = p_actor_user_id
      and role = 'administrator'
      and is_active
  ) into v_is_admin;
  if not v_is_admin then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;

  select id, delivery_batch_id, status, attempt_count
    into v_delivery
  from public.graduation_ticket_deliveries
  where id = p_delivery_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'delivery_not_found');
  end if;

  -- Idempotent replay: the attempt already exists, so do nothing further.
  if exists (
    select 1
    from public.graduation_ticket_delivery_attempts
    where attempt_reference = p_attempt_reference
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select coalesce(max(attempt_number), 0) + 1
    into v_next_number
  from public.graduation_ticket_delivery_attempts
  where delivery_id = p_delivery_id;

  insert into public.graduation_ticket_delivery_attempts (
    delivery_id,
    result_import_id,
    attempt_reference,
    attempt_number,
    intended_recipient_snapshot,
    actual_recipient_snapshot,
    mode,
    outcome,
    attempted_at,
    sent_by,
    provider,
    error_code,
    error_message,
    source_row_hash
  )
  values (
    p_delivery_id,
    p_result_import_id,
    p_attempt_reference,
    v_next_number,
    p_intended_recipient,
    p_actual_recipient,
    p_attempt_mode,
    p_outcome,
    p_attempted_at,
    p_sent_by,
    p_provider,
    p_error_code,
    p_error_message,
    p_source_row_hash
  );

  update public.graduation_ticket_deliveries
  set attempt_count = attempt_count + 1,
      last_attempt_at = p_attempted_at,
      last_error_code = p_error_code,
      last_error_message = p_error_message,
      status = coalesce(p_new_delivery_status, status),
      first_sent_at = case
        when p_new_delivery_status in ('sent', 'resent') and first_sent_at is null
          then p_attempted_at
        else first_sent_at
      end,
      latest_sent_at = case
        when p_new_delivery_status in ('sent', 'resent') then p_attempted_at
        else latest_sent_at
      end,
      bounced_at = case
        when p_new_delivery_status = 'bounce_detected' then p_attempted_at
        else bounced_at
      end,
      resend_required_at = case
        when p_new_delivery_status = 'resend_required' then now()
        else resend_required_at
      end,
      cancelled_at = case
        when p_new_delivery_status = 'cancelled' then now()
        else cancelled_at
      end
  where id = p_delivery_id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'attempt_number', v_next_number
  );
end;
$$;

revoke all on function public.record_ticket_delivery_attempt(
  uuid, uuid, uuid, text, public.ticket_delivery_mode,
  public.ticket_delivery_attempt_outcome, text, text, timestamptz, text, text,
  text, text, text, public.ticket_delivery_status
) from public;
revoke all on function public.record_ticket_delivery_attempt(
  uuid, uuid, uuid, text, public.ticket_delivery_mode,
  public.ticket_delivery_attempt_outcome, text, text, timestamptz, text, text,
  text, text, text, public.ticket_delivery_status
) from anon;
revoke all on function public.record_ticket_delivery_attempt(
  uuid, uuid, uuid, text, public.ticket_delivery_mode,
  public.ticket_delivery_attempt_outcome, text, text, timestamptz, text, text,
  text, text, text, public.ticket_delivery_status
) from authenticated;

-- ---------------------------------------------------------------------
-- 7. cancel_ticket_delivery_batch()
-- ---------------------------------------------------------------------
--
-- Cancels an unsent batch. Only a draft or prepared batch may be cancelled;
-- once sending has begun the batch keeps its history. Prepared deliveries in
-- the batch are marked cancelled so no future send can pick them up.

create or replace function public.cancel_ticket_delivery_batch(
  p_actor_user_id uuid,
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_batch record;
  v_cancelled integer;
begin
  select exists (
    select 1
    from public.staff_profiles
    where user_id = p_actor_user_id
      and role = 'administrator'
      and is_active
  ) into v_is_admin;
  if not v_is_admin then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;

  select id, status
    into v_batch
  from public.graduation_ticket_delivery_batches
  where id = p_batch_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'batch_not_found');
  end if;

  if v_batch.status not in ('draft', 'prepared') then
    return jsonb_build_object('ok', false, 'code', 'batch_not_cancellable');
  end if;

  update public.graduation_ticket_deliveries
  set status = 'cancelled',
      cancelled_at = now()
  where delivery_batch_id = p_batch_id
    and status = 'prepared';

  get diagnostics v_cancelled = row_count;

  update public.graduation_ticket_delivery_batches
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_count = cancelled_count + v_cancelled
  where id = p_batch_id;

  return jsonb_build_object('ok', true, 'cancelled_count', v_cancelled);
end;
$$;

revoke all on function public.cancel_ticket_delivery_batch(uuid, uuid) from public;
revoke all on function public.cancel_ticket_delivery_batch(uuid, uuid) from anon;
revoke all on function public.cancel_ticket_delivery_batch(uuid, uuid)
  from authenticated;

-- ---------------------------------------------------------------------
-- 8. Row level security
-- ---------------------------------------------------------------------
--
-- RLS is enabled and no policy is created, so every table is deny-by-default
-- for anon and authenticated roles (which include scanner and supervisor
-- staff). All access goes through the server-only service-role client.

alter table public.graduation_ticket_delivery_batches enable row level security;
alter table public.graduation_ticket_deliveries enable row level security;
alter table public.graduation_ticket_delivery_attempts enable row level security;
alter table public.graduation_ticket_delivery_result_imports enable row level security;

revoke all on table public.graduation_ticket_delivery_batches
  from anon, authenticated;
revoke all on table public.graduation_ticket_deliveries from anon, authenticated;
revoke all on table public.graduation_ticket_delivery_attempts
  from anon, authenticated;
revoke all on table public.graduation_ticket_delivery_result_imports
  from anon, authenticated;
