-- CHECKIN-05: Secure ticket generation.
-- Extends graduation_tickets with generation metadata, adds the
-- ticket_generation_batches and ticket_activity_log tables and adds
-- concurrency-safe database functions for bulk generation, replacement
-- and revocation of tickets.
--
-- Raw QR ticket tokens are never stored in any column of any table. Only
-- the SHA-256 hash of a token is persisted, and a format constraint
-- enforces the 64 character lowercase hexadecimal shape. This migration
-- never modifies earlier migrations and never deletes existing rows. The
-- one-active-ticket-per-registration partial unique index from CHECKIN-02
-- is preserved unchanged.

-- Enum: ticket generation batch status

create type public.ticket_generation_batch_status as enum (
  'processing',
  'completed',
  'partial',
  'failed'
);

-- Enum: ticket activity action

create type public.ticket_activity_action as enum (
  'generated',
  'replaced',
  'revoked'
);

-- Table: ticket_generation_batches
-- One row per bulk generation request. Stores counts and status only.
-- Names, emails, phone numbers, raw tokens and token hashes are never
-- stored in this table.

create table public.ticket_generation_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  idempotency_key text not null,
  status public.ticket_generation_batch_status not null default 'processing',
  candidate_count integer not null default 0,
  generated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ticket_generation_batches_idempotency_key_unique unique (
    idempotency_key
  ),
  constraint ticket_generation_batches_idempotency_key_not_blank check (
    char_length(btrim(idempotency_key)) > 0
  ),
  constraint ticket_generation_batches_counts_not_negative check (
    candidate_count >= 0
    and generated_count >= 0
    and skipped_count >= 0
    and error_count >= 0
  )
);

comment on table public.ticket_generation_batches is
  'Bulk ticket generation batches. Holds counts and status only. Never store names, contact details, raw tokens or token hashes here.';
comment on column public.ticket_generation_batches.idempotency_key is
  'Server-generated key that makes bulk generation safe against double submission.';

create index ticket_generation_batches_event_idx
  on public.ticket_generation_batches (event_id);
create index ticket_generation_batches_requested_by_idx
  on public.ticket_generation_batches (requested_by);
create index ticket_generation_batches_status_idx
  on public.ticket_generation_batches (status);
create index ticket_generation_batches_created_at_idx
  on public.ticket_generation_batches (created_at);

-- Table: ticket_activity_log
-- Append-oriented record of ticket generation, replacement and revocation.
-- The metadata column may hold operational context only. Raw tokens, token
-- hashes, ticket secrets, emails, phone numbers, guest names, access
-- tokens and cookies are never stored here.

create table public.ticket_activity_log (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null
    references public.graduation_tickets (id) on delete cascade,
  registration_id uuid not null
    references public.graduation_registrations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action public.ticket_activity_action not null,
  previous_ticket_id uuid
    references public.graduation_tickets (id) on delete set null,
  replacement_ticket_id uuid
    references public.graduation_tickets (id) on delete set null,
  reason text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ticket_activity_log_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint ticket_activity_log_reason_length check (
    reason is null or char_length(reason) between 5 and 500
  )
);

comment on table public.ticket_activity_log is
  'Append-oriented ticket action audit log. Never store a raw token, token hash, ticket secret, email, phone number, guest name, access token or cookie in any column.';
comment on column public.ticket_activity_log.request_id is
  'Opaque tracing identifier generated server-side. Must never contain secrets.';

create index ticket_activity_log_ticket_idx
  on public.ticket_activity_log (ticket_id);
create index ticket_activity_log_registration_idx
  on public.ticket_activity_log (registration_id);
create index ticket_activity_log_actor_idx
  on public.ticket_activity_log (actor_user_id);
create index ticket_activity_log_action_idx
  on public.ticket_activity_log (action);
create index ticket_activity_log_created_at_idx
  on public.ticket_activity_log (created_at);

-- Extend graduation_tickets.
-- token_hash keeps holding only the SHA-256 hash of the QR token. No
-- raw-token column is added and none may ever be added.

alter table public.graduation_tickets
  add column if not exists token_version integer not null default 1,
  add column if not exists generation_batch_id uuid
    references public.ticket_generation_batches (id) on delete set null,
  add column if not exists issued_by uuid
    references auth.users (id) on delete set null,
  add column if not exists revoked_by uuid
    references auth.users (id) on delete set null,
  add column if not exists revocation_reason text;

alter table public.graduation_tickets
  add constraint graduation_tickets_token_version_positive check (
    token_version > 0
  ),
  add constraint graduation_tickets_token_hash_format check (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  add constraint graduation_tickets_revocation_reason_length check (
    revocation_reason is null or char_length(revocation_reason) between 5 and 500
  );

comment on column public.graduation_tickets.token_version is
  'Version of the HMAC token format used for this ticket. Positive integer, currently 1.';
comment on column public.graduation_tickets.revocation_reason is
  'Reason recorded when a ticket is revoked or replaced. Null while the ticket is active.';

create index graduation_tickets_generation_batch_idx
  on public.graduation_tickets (generation_batch_id);
create index graduation_tickets_issued_by_idx
  on public.graduation_tickets (issued_by);
create index graduation_tickets_revoked_by_idx
  on public.graduation_tickets (revoked_by);
create index graduation_tickets_registration_status_idx
  on public.graduation_tickets (registration_id, status);
create index graduation_tickets_created_at_idx
  on public.graduation_tickets (created_at);

-- Row Level Security. No policies are created, so anon and authenticated
-- roles can never read or write batch or activity rows. Access remains
-- restricted to trusted server-side code using the service role.

alter table public.ticket_generation_batches enable row level security;
alter table public.ticket_activity_log enable row level security;

revoke all on table public.ticket_generation_batches from anon, authenticated;
revoke all on table public.ticket_activity_log from anon, authenticated;

-- Function: apply_ticket_generation_batch
-- Atomically applies one bulk generation batch. The caller passes only
-- server-generated values: ticket UUIDs, registration UUIDs, ticket codes,
-- token hashes and token versions. Items that carry a raw token field are
-- rejected outright. The idempotency key makes double submission safe: a
-- completed batch is returned again instead of generating twice.

create or replace function public.apply_ticket_generation_batch(
  p_actor_user_id uuid,
  p_event_id uuid,
  p_idempotency_key text,
  p_request_id text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_event public.graduation_events%rowtype;
  v_existing public.ticket_generation_batches%rowtype;
  v_registration public.graduation_registrations%rowtype;
  v_batch_id uuid;
  v_item jsonb;
  v_key text;
  v_ticket_id uuid;
  v_registration_id uuid;
  v_ticket_code text;
  v_token_hash text;
  v_token_version integer;
  v_candidate_count integer := 0;
  v_generated_count integer := 0;
  v_skipped_count integer := 0;
  v_error_count integer := 0;
  v_final_status public.ticket_generation_batch_status;
begin
  -- The acting user must be an active administrator.
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

  if p_idempotency_key is null
    or char_length(btrim(p_idempotency_key)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'idempotency_key_required');
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'invalid_items');
  end if;

  -- Idempotent replay: a batch already completed under this key returns
  -- its previous result without generating anything again.
  select * into v_existing
  from public.ticket_generation_batches
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.status in ('completed', 'partial') then
      return jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'batch_id', v_existing.id,
        'candidate_count', v_existing.candidate_count,
        'generated_count', v_existing.generated_count,
        'skipped_count', v_existing.skipped_count,
        'error_count', v_existing.error_count
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'batch_in_progress');
  end if;

  -- Lock the event so concurrent batches serialize on it.
  select * into v_event
  from public.graduation_events
  where id = p_event_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'event_not_found');
  end if;
  if v_event.status in ('closed', 'archived') then
    return jsonb_build_object('ok', false, 'code', 'event_not_open');
  end if;

  v_candidate_count := jsonb_array_length(p_items);

  begin
    insert into public.ticket_generation_batches (
      event_id, requested_by, idempotency_key, status,
      candidate_count, is_test
    )
    values (
      p_event_id, p_actor_user_id, p_idempotency_key, 'processing',
      v_candidate_count, v_event.is_test
    )
    returning id into v_batch_id;
  exception
    when unique_violation then
      -- A concurrent request already claimed this idempotency key.
      select * into v_existing
      from public.ticket_generation_batches
      where idempotency_key = p_idempotency_key;
      if found and v_existing.status in ('completed', 'partial') then
        return jsonb_build_object(
          'ok', true,
          'duplicate', true,
          'batch_id', v_existing.id,
          'candidate_count', v_existing.candidate_count,
          'generated_count', v_existing.generated_count,
          'skipped_count', v_existing.skipped_count,
          'error_count', v_existing.error_count
        );
      end if;
      return jsonb_build_object('ok', false, 'code', 'batch_in_progress');
  end;

  for v_item in select value from jsonb_array_elements(p_items) loop
    -- Reject any item that carries a raw token field. Only hashes are
    -- ever accepted by the database.
    for v_key in select jsonb_object_keys(v_item) loop
      if lower(v_key) in (
        'raw_token', 'token', 'qr_token', 'qr_payload',
        'token_value', 'ticket_token'
      ) then
        raise exception 'Raw token fields are never accepted.';
      end if;
    end loop;

    begin
      v_ticket_id := (v_item ->> 'ticket_id')::uuid;
      v_registration_id := (v_item ->> 'registration_id')::uuid;
      v_ticket_code := v_item ->> 'ticket_code';
      v_token_hash := v_item ->> 'token_hash';
      v_token_version := coalesce((v_item ->> 'token_version')::integer, 1);

      if v_ticket_id is null
        or v_registration_id is null
        or v_ticket_code is null
        or v_token_hash is null
        or v_token_hash !~ '^[0-9a-f]{64}$'
        or v_token_version <= 0 then
        v_error_count := v_error_count + 1;
        continue;
      end if;

      -- Lock the candidate registration and re-verify eligibility.
      select * into v_registration
      from public.graduation_registrations
      where id = v_registration_id
      for update;
      if not found or v_registration.event_id <> p_event_id then
        v_error_count := v_error_count + 1;
        continue;
      end if;
      if v_registration.registration_status <> 'eligible' then
        v_skipped_count := v_skipped_count + 1;
        continue;
      end if;
      if exists (
        select 1
        from public.graduation_tickets
        where registration_id = v_registration_id
          and status = 'active'
      ) then
        v_skipped_count := v_skipped_count + 1;
        continue;
      end if;

      insert into public.graduation_tickets (
        id, registration_id, ticket_code, token_hash, token_version,
        status, issued_at, issued_by, generation_batch_id, is_test
      )
      values (
        v_ticket_id, v_registration_id, v_ticket_code, v_token_hash,
        v_token_version, 'active', now(), p_actor_user_id, v_batch_id,
        (v_registration.is_test or v_event.is_test)
      );

      insert into public.ticket_activity_log (
        ticket_id, registration_id, actor_user_id, action, request_id
      )
      values (
        v_ticket_id, v_registration_id, p_actor_user_id, 'generated',
        p_request_id
      );

      v_generated_count := v_generated_count + 1;
    exception
      when invalid_text_representation or unique_violation then
        v_error_count := v_error_count + 1;
    end;
  end loop;

  v_final_status := case
    when v_error_count = 0 then 'completed'
    else 'partial'
  end;

  update public.ticket_generation_batches
  set status = v_final_status,
      candidate_count = v_candidate_count,
      generated_count = v_generated_count,
      skipped_count = v_skipped_count,
      error_count = v_error_count,
      completed_at = now()
  where id = v_batch_id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'batch_id', v_batch_id,
    'candidate_count', v_candidate_count,
    'generated_count', v_generated_count,
    'skipped_count', v_skipped_count,
    'error_count', v_error_count
  );
end;
$$;

comment on function public.apply_ticket_generation_batch(uuid, uuid, text, text, jsonb) is
  'Applies one idempotent bulk ticket generation batch for an active administrator. Accepts only server-generated ticket IDs, ticket codes and token hashes. Raw tokens are rejected and never stored.';

revoke all on function public.apply_ticket_generation_batch(uuid, uuid, text, text, jsonb) from public;
revoke all on function public.apply_ticket_generation_batch(uuid, uuid, text, text, jsonb) from anon;
revoke all on function public.apply_ticket_generation_batch(uuid, uuid, text, text, jsonb) from authenticated;

-- Function: replace_graduation_ticket
-- Atomically replaces one active ticket. The old ticket is marked replaced
-- before the new active ticket is inserted so the partial unique index on
-- active tickets is never violated. The response carries ticket IDs, codes
-- and statuses only. Raw tokens are never returned.

create or replace function public.replace_graduation_ticket(
  p_actor_user_id uuid,
  p_ticket_id uuid,
  p_new_ticket_id uuid,
  p_new_ticket_code text,
  p_new_token_hash text,
  p_new_token_version integer,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_ticket public.graduation_tickets%rowtype;
  v_registration public.graduation_registrations%rowtype;
  v_reason text;
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

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    return jsonb_build_object('ok', false, 'code', 'invalid_reason');
  end if;

  if p_new_ticket_id is null
    or p_new_ticket_code is null
    or char_length(btrim(p_new_ticket_code)) = 0
    or p_new_token_hash is null
    or p_new_token_hash !~ '^[0-9a-f]{64}$'
    or coalesce(p_new_token_version, 0) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_replacement');
  end if;

  -- Lock the current ticket so concurrent replacements serialize.
  select * into v_ticket
  from public.graduation_tickets
  where id = p_ticket_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ticket_not_found');
  end if;
  if v_ticket.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'ticket_not_active');
  end if;

  -- Lock the registration and confirm it remains eligible.
  select * into v_registration
  from public.graduation_registrations
  where id = v_ticket.registration_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'registration_not_found');
  end if;
  if v_registration.registration_status <> 'eligible' then
    return jsonb_build_object('ok', false, 'code', 'registration_not_eligible');
  end if;

  -- Retire the old ticket first so the one-active-per-registration index
  -- allows the new active ticket.
  update public.graduation_tickets
  set status = 'replaced',
      replaced_by_ticket_id = p_new_ticket_id,
      revoked_at = now(),
      revoked_by = p_actor_user_id,
      revocation_reason = v_reason
  where id = p_ticket_id;

  insert into public.graduation_tickets (
    id, registration_id, ticket_code, token_hash, token_version,
    status, issued_at, issued_by, is_test
  )
  values (
    p_new_ticket_id, v_ticket.registration_id, p_new_ticket_code,
    p_new_token_hash, p_new_token_version, 'active', now(),
    p_actor_user_id, v_ticket.is_test
  );

  insert into public.ticket_activity_log (
    ticket_id, registration_id, actor_user_id, action,
    previous_ticket_id, replacement_ticket_id, reason, request_id
  )
  values (
    p_ticket_id, v_ticket.registration_id, p_actor_user_id, 'replaced',
    p_ticket_id, p_new_ticket_id, v_reason, p_request_id
  );

  return jsonb_build_object(
    'ok', true,
    'previous_ticket', jsonb_build_object(
      'id', p_ticket_id,
      'ticket_code', v_ticket.ticket_code,
      'status', 'replaced'
    ),
    'new_ticket', jsonb_build_object(
      'id', p_new_ticket_id,
      'ticket_code', p_new_ticket_code,
      'status', 'active'
    )
  );
end;
$$;

comment on function public.replace_graduation_ticket(uuid, uuid, uuid, text, text, integer, text, text) is
  'Replaces one active ticket for an active administrator. The previous ticket becomes replaced and can no longer be scanned as active. Returns ticket IDs, codes and statuses only.';

revoke all on function public.replace_graduation_ticket(uuid, uuid, uuid, text, text, integer, text, text) from public;
revoke all on function public.replace_graduation_ticket(uuid, uuid, uuid, text, text, integer, text, text) from anon;
revoke all on function public.replace_graduation_ticket(uuid, uuid, uuid, text, text, integer, text, text) from authenticated;

-- Function: revoke_graduation_ticket
-- Atomically revokes one active ticket. No replacement is generated.

create or replace function public.revoke_graduation_ticket(
  p_actor_user_id uuid,
  p_ticket_id uuid,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_ticket public.graduation_tickets%rowtype;
  v_reason text;
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

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    return jsonb_build_object('ok', false, 'code', 'invalid_reason');
  end if;

  select * into v_ticket
  from public.graduation_tickets
  where id = p_ticket_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ticket_not_found');
  end if;
  if v_ticket.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'ticket_not_active');
  end if;

  update public.graduation_tickets
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = p_actor_user_id,
      revocation_reason = v_reason
  where id = p_ticket_id;

  insert into public.ticket_activity_log (
    ticket_id, registration_id, actor_user_id, action, reason, request_id
  )
  values (
    p_ticket_id, v_ticket.registration_id, p_actor_user_id, 'revoked',
    v_reason, p_request_id
  );

  return jsonb_build_object(
    'ok', true,
    'ticket', jsonb_build_object(
      'id', p_ticket_id,
      'ticket_code', v_ticket.ticket_code,
      'status', 'revoked'
    )
  );
end;
$$;

comment on function public.revoke_graduation_ticket(uuid, uuid, text, text) is
  'Revokes one active ticket for an active administrator. No replacement is generated automatically. Returns status information only.';

revoke all on function public.revoke_graduation_ticket(uuid, uuid, text, text) from public;
revoke all on function public.revoke_graduation_ticket(uuid, uuid, text, text) from anon;
revoke all on function public.revoke_graduation_ticket(uuid, uuid, text, text) from authenticated;
