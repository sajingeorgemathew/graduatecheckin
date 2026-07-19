-- CHECKIN-08: live attendance dashboard, manual search and supervisor
-- corrections.
--
-- This migration is additive only. It never drops, deletes, renames or
-- alters previously deployed objects and never updates or deletes any
-- existing row. It reuses the existing graduation_checkins table and its
-- existing attendance delta columns (graduate_delta, adult_guest_delta,
-- child_0_4_delta, child_5_10_delta) and never creates duplicate attendance
-- columns.
--
-- Attendance belongs to the registration, never to a single ticket. Every
-- total is recalculated across all graduation_checkins rows of the
-- registration under a registration lock, so replacing a ticket never
-- resets or duplicates attendance. Manual arrivals, corrections and
-- reversals are append-only: each inserts one new row and never edits or
-- removes an earlier row.
--
-- Reused metadata (no duplicate columns are added):
--   * reverses_checkin_id  links a reversal row to the exact row it negates.
--   * recorded_by          records the acting supervisor or administrator.
-- Only genuinely missing metadata is added: entry_kind and reason.
--
-- Privacy: the new columns store an entry classification and a short staff
-- reason only. No QR payload, raw token, token hash, ticket code, email,
-- phone, guest name or payment value is ever stored or returned here.

-- 1. Attendance entry classification.
--
-- The existing action enum (admission, correction, reversal) cannot
-- distinguish a scan arrival from a manual arrival, since both are
-- admissions. A dedicated entry_kind enum captures the four classifications
-- the dashboard and audit history must show.
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'attendance_entry_kind'
  ) then
    create type public.attendance_entry_kind as enum (
      'scan_arrival',
      'manual_arrival',
      'correction',
      'reversal'
    );
  end if;
end
$$;

-- 2. Add only the missing metadata columns.
--
-- entry_kind carries a default so every legacy and mock row is classified
-- as a scan arrival without any update statement; new inserts always set it
-- explicitly. reason is nullable so legacy rows stay valid; the constraints
-- below require it for manual arrival, correction and reversal rows.
alter table public.graduation_checkins
  add column if not exists entry_kind public.attendance_entry_kind
    not null default 'scan_arrival';

alter table public.graduation_checkins
  add column if not exists reason text;

comment on column public.graduation_checkins.entry_kind is
  'Attendance entry classification: scan_arrival, manual_arrival, correction or reversal. Legacy and mock rows default to scan_arrival. The reused action column keeps its admission/correction/reversal meaning.';
comment on column public.graduation_checkins.reason is
  'Short staff-entered reason for a manual arrival, correction or reversal. Required for those entry kinds and null for scan arrivals. Never contains contact, token or payment values.';

-- 3. reason is required for manual arrival, correction and reversal and, when
-- present, must be between 5 and 500 characters. Existing scan-arrival rows
-- carry a null reason and stay valid.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'graduation_checkins_reason_length'
  ) then
    alter table public.graduation_checkins
      add constraint graduation_checkins_reason_length check (
        reason is null
        or char_length(btrim(reason)) between 5 and 500
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'graduation_checkins_reason_required'
  ) then
    alter table public.graduation_checkins
      add constraint graduation_checkins_reason_required check (
        entry_kind = 'scan_arrival'
        or reason is not null
      );
  end if;
end
$$;

-- 4. Indexes for entry-kind filtering, actor lookups, reversal links and
-- registration-time ordering. The registration-created and recorded-by
-- indexes already exist from CHECKIN-07; only the genuinely new access paths
-- are added, all with if not exists.
create index if not exists graduation_checkins_entry_kind_idx
  on public.graduation_checkins (entry_kind);

create index if not exists graduation_checkins_reverses_checkin_idx
  on public.graduation_checkins (reverses_checkin_id);

create index if not exists graduation_checkins_registration_created_idx
  on public.graduation_checkins (registration_id, created_at);

create index if not exists graduation_checkins_recorded_by_idx
  on public.graduation_checkins (recorded_by);

-- 5. A given attendance row may be reversed at most once. This partial
-- unique index is the database guarantee behind "prevent double reversal";
-- a second reversal of the same original row rolls back on the unique
-- violation.
create unique index if not exists graduation_checkins_one_reversal_per_row
  on public.graduation_checkins (reverses_checkin_id)
  where reverses_checkin_id is not null;

-- 6. Atomic manual arrival.
--
-- Records one append-only positive admission for a registration whose QR
-- ticket is unavailable. The acting supervisor or administrator is verified
-- inside the function as defense in depth. The whole sequence runs in one
-- transaction under an event and registration lock; any failure rolls
-- everything back. Security definer with a fixed empty search_path and
-- execution revoked from public, anon and authenticated so only trusted
-- server-side service-role code may call it.
create or replace function public.apply_manual_graduation_arrival(
  p_actor_user_id uuid,
  p_event_id uuid,
  p_registration_id uuid,
  p_request_id uuid,
  p_graduate_arriving integer,
  p_adult_guests_arriving integer,
  p_children_0_4_arriving integer,
  p_children_5_10_arriving integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_supervisor boolean;
  v_event public.graduation_events%rowtype;
  v_registration public.graduation_registrations%rowtype;
  v_existing public.graduation_checkins%rowtype;
  v_reason text;
  v_grad_before integer;
  v_adult_before integer;
  v_child_0_4_before integer;
  v_child_5_10_before integer;
  v_grad_total integer;
  v_adult_total integer;
  v_child_0_4_total integer;
  v_child_5_10_total integer;
  v_expected integer;
  v_arrived_total integer;
  v_recorded_at timestamptz;
begin
  -- 1. The acting user must be an active supervisor or administrator.
  select exists (
    select 1
    from public.staff_profiles
    where user_id = p_actor_user_id
      and is_active
      and role in ('supervisor', 'administrator')
  ) into v_is_supervisor;
  if not v_is_supervisor then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  -- 2. Required identifiers and reason.
  if p_request_id is null or p_registration_id is null
    or p_event_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;
  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;

  -- 3. Idempotent retry by actor and request id.
  select * into v_existing
  from public.graduation_checkins
  where recorded_by = p_actor_user_id
    and request_id = p_request_id
  limit 1;
  if found and v_existing.registration_id is not null then
    select * into v_registration
    from public.graduation_registrations
    where id = v_existing.registration_id;

    select
      least(greatest(coalesce(sum(graduate_delta), 0), 0), 1),
      least(greatest(coalesce(sum(adult_guest_delta), 0), 0),
        v_registration.registered_adult_guests),
      least(greatest(coalesce(sum(child_0_4_delta), 0), 0),
        v_registration.registered_children_0_4),
      least(greatest(coalesce(sum(child_5_10_delta), 0), 0),
        v_registration.registered_children_5_10)
    into v_grad_total, v_adult_total, v_child_0_4_total, v_child_5_10_total
    from public.graduation_checkins
    where registration_id = v_existing.registration_id;

    v_expected := 1 + v_registration.registered_adult_guests
      + v_registration.registered_children_0_4
      + v_registration.registered_children_5_10;
    v_arrived_total := v_grad_total + v_adult_total + v_child_0_4_total
      + v_child_5_10_total;

    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'result', case when v_arrived_total >= v_expected
        then 'complete' else 'partial' end,
      'graduate_name', v_registration.graduate_full_name,
      'registered_adult_guests', v_registration.registered_adult_guests,
      'registered_children_0_4', v_registration.registered_children_0_4,
      'registered_children_5_10', v_registration.registered_children_5_10,
      'expected_party_size', v_expected,
      'graduate_arrived_total', v_grad_total,
      'adult_guests_arrived_total', v_adult_total,
      'children_0_4_arrived_total', v_child_0_4_total,
      'children_5_10_arrived_total', v_child_5_10_total,
      'remaining_adult_guests',
        v_registration.registered_adult_guests - v_adult_total,
      'remaining_children_0_4',
        v_registration.registered_children_0_4 - v_child_0_4_total,
      'remaining_children_5_10',
        v_registration.registered_children_5_10 - v_child_5_10_total,
      'remaining_party_size', greatest(v_expected - v_arrived_total, 0),
      'recorded_at', v_existing.created_at
    );
  end if;

  -- 4. Lock and revalidate the configured event.
  select * into v_event
  from public.graduation_events
  where id = p_event_id
  for update;
  if not found
    or v_event.status = 'closed'
    or v_event.status = 'archived' then
    return jsonb_build_object('ok', false, 'code', 'configuration_error');
  end if;

  -- 5. Lock the registration and require it to belong to the active event
  -- and remain eligible.
  select * into v_registration
  from public.graduation_registrations
  where id = p_registration_id
  for update;
  if not found or v_registration.event_id <> v_event.id then
    return jsonb_build_object('ok', false, 'code', 'registration_blocked');
  end if;
  if v_registration.registration_status <> 'eligible' then
    return jsonb_build_object('ok', false, 'code', 'registration_blocked');
  end if;

  -- 6. Validate the arriving-now counts. Manual arrival inserts positive
  -- deltas only; at least one person must arrive.
  if p_graduate_arriving is null
    or p_adult_guests_arriving is null
    or p_children_0_4_arriving is null
    or p_children_5_10_arriving is null
    or p_graduate_arriving < 0 or p_graduate_arriving > 1
    or p_adult_guests_arriving < 0
    or p_children_0_4_arriving < 0
    or p_children_5_10_arriving < 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_counts');
  end if;
  if p_graduate_arriving + p_adult_guests_arriving
    + p_children_0_4_arriving + p_children_5_10_arriving = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_counts');
  end if;
  if p_graduate_arriving > 1
    or p_adult_guests_arriving > v_registration.registered_adult_guests
    or p_children_0_4_arriving > v_registration.registered_children_0_4
    or p_children_5_10_arriving > v_registration.registered_children_5_10 then
    return jsonb_build_object('ok', false, 'code', 'allowance_exceeded');
  end if;

  -- 7. Recalculate registration-level attendance under the lock and clamp
  -- each category between zero and its registered allowance.
  select
    coalesce(sum(graduate_delta), 0),
    coalesce(sum(adult_guest_delta), 0),
    coalesce(sum(child_0_4_delta), 0),
    coalesce(sum(child_5_10_delta), 0)
  into v_grad_before, v_adult_before, v_child_0_4_before, v_child_5_10_before
  from public.graduation_checkins
  where registration_id = v_registration.id;

  v_grad_before := least(greatest(v_grad_before, 0), 1);
  v_adult_before := least(greatest(v_adult_before, 0),
    v_registration.registered_adult_guests);
  v_child_0_4_before := least(greatest(v_child_0_4_before, 0),
    v_registration.registered_children_0_4);
  v_child_5_10_before := least(greatest(v_child_5_10_before, 0),
    v_registration.registered_children_5_10);

  v_expected := 1 + v_registration.registered_adult_guests
    + v_registration.registered_children_0_4
    + v_registration.registered_children_5_10;

  -- 8. The arrival must fit within the remaining allowance computed under the
  -- lock. When it does not, someone was admitted concurrently; the request
  -- loses the race and receives a conflict with refreshed totals.
  if v_grad_before + p_graduate_arriving > 1
    or v_adult_before + p_adult_guests_arriving
      > v_registration.registered_adult_guests
    or v_child_0_4_before + p_children_0_4_arriving
      > v_registration.registered_children_0_4
    or v_child_5_10_before + p_children_5_10_arriving
      > v_registration.registered_children_5_10 then
    return jsonb_build_object(
      'ok', false,
      'code', 'conflict',
      'graduate_arrived_total', v_grad_before,
      'adult_guests_arrived_total', v_adult_before,
      'children_0_4_arrived_total', v_child_0_4_before,
      'children_5_10_arrived_total', v_child_5_10_before,
      'remaining_adult_guests',
        v_registration.registered_adult_guests - v_adult_before,
      'remaining_children_0_4',
        v_registration.registered_children_0_4 - v_child_0_4_before,
      'remaining_children_5_10',
        v_registration.registered_children_5_10 - v_child_5_10_before,
      'remaining_party_size', greatest(v_expected
        - (v_grad_before + v_adult_before + v_child_0_4_before
          + v_child_5_10_before), 0)
    );
  end if;

  -- 9. Insert one append-only manual arrival. Only positive deltas are
  -- written. No ticket is stored because no ticket was used.
  insert into public.graduation_checkins (
    registration_id,
    ticket_id,
    staff_user_id,
    method,
    action,
    entry_kind,
    graduate_delta,
    adult_guest_delta,
    child_0_4_delta,
    child_5_10_delta,
    reason,
    idempotency_key,
    request_id,
    recorded_by,
    is_test
  )
  values (
    v_registration.id,
    null,
    p_actor_user_id,
    'manual_search',
    'admission',
    'manual_arrival',
    p_graduate_arriving,
    p_adult_guests_arriving,
    p_children_0_4_arriving,
    p_children_5_10_arriving,
    v_reason,
    p_actor_user_id::text || ':' || p_request_id::text,
    p_request_id,
    p_actor_user_id,
    v_registration.is_test
  )
  returning created_at into v_recorded_at;

  v_grad_total := v_grad_before + p_graduate_arriving;
  v_adult_total := v_adult_before + p_adult_guests_arriving;
  v_child_0_4_total := v_child_0_4_before + p_children_0_4_arriving;
  v_child_5_10_total := v_child_5_10_before + p_children_5_10_arriving;
  v_arrived_total := v_grad_total + v_adult_total + v_child_0_4_total
    + v_child_5_10_total;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'result', case when v_arrived_total >= v_expected
      then 'complete' else 'partial' end,
    'graduate_name', v_registration.graduate_full_name,
    'registered_adult_guests', v_registration.registered_adult_guests,
    'registered_children_0_4', v_registration.registered_children_0_4,
    'registered_children_5_10', v_registration.registered_children_5_10,
    'expected_party_size', v_expected,
    'graduate_arrived_before', v_grad_before,
    'adult_guests_arrived_before', v_adult_before,
    'children_0_4_arrived_before', v_child_0_4_before,
    'children_5_10_arrived_before', v_child_5_10_before,
    'graduate_arrived_total', v_grad_total,
    'adult_guests_arrived_total', v_adult_total,
    'children_0_4_arrived_total', v_child_0_4_total,
    'children_5_10_arrived_total', v_child_5_10_total,
    'remaining_adult_guests',
      v_registration.registered_adult_guests - v_adult_total,
    'remaining_children_0_4',
      v_registration.registered_children_0_4 - v_child_0_4_total,
    'remaining_children_5_10',
      v_registration.registered_children_5_10 - v_child_5_10_total,
    'remaining_party_size', greatest(v_expected - v_arrived_total, 0),
    'recorded_at', v_recorded_at
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'conflict');
end;
$$;

comment on function public.apply_manual_graduation_arrival(uuid, uuid, uuid, uuid, integer, integer, integer, integer, text) is
  'Records one append-only positive manual arrival for a registration whose QR ticket is unavailable. Verifies an active supervisor or administrator, requires a reason, locks the event and registration, recalculates registration-level attendance under the lock, enforces registered allowances, and stays idempotent per acting user and request id. Never updates or deletes any row and never changes allowances, ticket status or payment status. Returns safe attendance totals with the graduate name only.';

revoke all on function public.apply_manual_graduation_arrival(uuid, uuid, uuid, uuid, integer, integer, integer, integer, text) from public;
revoke all on function public.apply_manual_graduation_arrival(uuid, uuid, uuid, uuid, integer, integer, integer, integer, text) from anon;
revoke all on function public.apply_manual_graduation_arrival(uuid, uuid, uuid, uuid, integer, integer, integer, integer, text) from authenticated;

-- 7. Atomic attendance correction.
--
-- Inserts one append-only correction row with positive or negative deltas.
-- The final registration totals must stay within allowances and never go
-- negative. Security definer with a fixed empty search_path; execution
-- revoked from public, anon and authenticated.
create or replace function public.apply_attendance_correction(
  p_actor_user_id uuid,
  p_event_id uuid,
  p_registration_id uuid,
  p_request_id uuid,
  p_graduate_delta integer,
  p_adult_guest_delta integer,
  p_child_0_4_delta integer,
  p_child_5_10_delta integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_supervisor boolean;
  v_event public.graduation_events%rowtype;
  v_registration public.graduation_registrations%rowtype;
  v_existing public.graduation_checkins%rowtype;
  v_reason text;
  v_grad_before integer;
  v_adult_before integer;
  v_child_0_4_before integer;
  v_child_5_10_before integer;
  v_grad_after integer;
  v_adult_after integer;
  v_child_0_4_after integer;
  v_child_5_10_after integer;
  v_expected integer;
  v_recorded_at timestamptz;
begin
  select exists (
    select 1
    from public.staff_profiles
    where user_id = p_actor_user_id
      and is_active
      and role in ('supervisor', 'administrator')
  ) into v_is_supervisor;
  if not v_is_supervisor then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  if p_request_id is null or p_registration_id is null
    or p_event_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;
  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;

  -- Deltas must be present, within the per-column ranges and not all zero.
  if p_graduate_delta is null or p_adult_guest_delta is null
    or p_child_0_4_delta is null or p_child_5_10_delta is null
    or p_graduate_delta < -1 or p_graduate_delta > 1
    or p_adult_guest_delta < -2 or p_adult_guest_delta > 2
    or p_child_0_4_delta < -2 or p_child_0_4_delta > 2
    or p_child_5_10_delta < -2 or p_child_5_10_delta > 2 then
    return jsonb_build_object('ok', false, 'code', 'invalid_correction');
  end if;
  if p_graduate_delta = 0 and p_adult_guest_delta = 0
    and p_child_0_4_delta = 0 and p_child_5_10_delta = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_correction');
  end if;

  -- Idempotent retry by actor and request id.
  select * into v_existing
  from public.graduation_checkins
  where recorded_by = p_actor_user_id
    and request_id = p_request_id
  limit 1;
  if found and v_existing.registration_id is not null then
    select * into v_registration
    from public.graduation_registrations
    where id = v_existing.registration_id;

    select
      least(greatest(coalesce(sum(graduate_delta), 0), 0), 1),
      least(greatest(coalesce(sum(adult_guest_delta), 0), 0),
        v_registration.registered_adult_guests),
      least(greatest(coalesce(sum(child_0_4_delta), 0), 0),
        v_registration.registered_children_0_4),
      least(greatest(coalesce(sum(child_5_10_delta), 0), 0),
        v_registration.registered_children_5_10)
    into v_grad_after, v_adult_after, v_child_0_4_after, v_child_5_10_after
    from public.graduation_checkins
    where registration_id = v_existing.registration_id;

    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'graduate_name', v_registration.graduate_full_name,
      'registered_adult_guests', v_registration.registered_adult_guests,
      'registered_children_0_4', v_registration.registered_children_0_4,
      'registered_children_5_10', v_registration.registered_children_5_10,
      'graduate_arrived_total', v_grad_after,
      'adult_guests_arrived_total', v_adult_after,
      'children_0_4_arrived_total', v_child_0_4_after,
      'children_5_10_arrived_total', v_child_5_10_after
    );
  end if;

  select * into v_event
  from public.graduation_events
  where id = p_event_id
  for update;
  if not found
    or v_event.status = 'closed'
    or v_event.status = 'archived' then
    return jsonb_build_object('ok', false, 'code', 'configuration_error');
  end if;

  select * into v_registration
  from public.graduation_registrations
  where id = p_registration_id
  for update;
  if not found or v_registration.event_id <> v_event.id then
    return jsonb_build_object('ok', false, 'code', 'registration_blocked');
  end if;
  if v_registration.registration_status <> 'eligible' then
    return jsonb_build_object('ok', false, 'code', 'registration_blocked');
  end if;

  -- Recalculate current attendance under the lock.
  select
    least(greatest(coalesce(sum(graduate_delta), 0), 0), 1),
    least(greatest(coalesce(sum(adult_guest_delta), 0), 0),
      v_registration.registered_adult_guests),
    least(greatest(coalesce(sum(child_0_4_delta), 0), 0),
      v_registration.registered_children_0_4),
    least(greatest(coalesce(sum(child_5_10_delta), 0), 0),
      v_registration.registered_children_5_10)
  into v_grad_before, v_adult_before, v_child_0_4_before, v_child_5_10_before
  from public.graduation_checkins
  where registration_id = v_registration.id;

  v_grad_after := v_grad_before + p_graduate_delta;
  v_adult_after := v_adult_before + p_adult_guest_delta;
  v_child_0_4_after := v_child_0_4_before + p_child_0_4_delta;
  v_child_5_10_after := v_child_5_10_before + p_child_5_10_delta;

  -- The graduate stays between 0 and 1; guests and children stay between 0
  -- and their registered allowances. A correction never exceeds allowances
  -- and never creates negative attendance.
  if v_grad_after < 0 or v_grad_after > 1
    or v_adult_after < 0
    or v_adult_after > v_registration.registered_adult_guests
    or v_child_0_4_after < 0
    or v_child_0_4_after > v_registration.registered_children_0_4
    or v_child_5_10_after < 0
    or v_child_5_10_after > v_registration.registered_children_5_10 then
    return jsonb_build_object(
      'ok', false,
      'code', 'result_out_of_range',
      'graduate_arrived_total', v_grad_before,
      'adult_guests_arrived_total', v_adult_before,
      'children_0_4_arrived_total', v_child_0_4_before,
      'children_5_10_arrived_total', v_child_5_10_before
    );
  end if;

  v_expected := 1 + v_registration.registered_adult_guests
    + v_registration.registered_children_0_4
    + v_registration.registered_children_5_10;

  -- Insert one append-only correction row. Deltas may be positive or
  -- negative. No earlier row is updated or deleted.
  insert into public.graduation_checkins (
    registration_id,
    ticket_id,
    staff_user_id,
    method,
    action,
    entry_kind,
    graduate_delta,
    adult_guest_delta,
    child_0_4_delta,
    child_5_10_delta,
    reason,
    idempotency_key,
    request_id,
    recorded_by,
    is_test
  )
  values (
    v_registration.id,
    null,
    p_actor_user_id,
    'supervisor_adjustment',
    'correction',
    'correction',
    p_graduate_delta,
    p_adult_guest_delta,
    p_child_0_4_delta,
    p_child_5_10_delta,
    v_reason,
    p_actor_user_id::text || ':' || p_request_id::text,
    p_request_id,
    p_actor_user_id,
    v_registration.is_test
  )
  returning created_at into v_recorded_at;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'graduate_name', v_registration.graduate_full_name,
    'registered_adult_guests', v_registration.registered_adult_guests,
    'registered_children_0_4', v_registration.registered_children_0_4,
    'registered_children_5_10', v_registration.registered_children_5_10,
    'expected_party_size', v_expected,
    'graduate_arrived_before', v_grad_before,
    'adult_guests_arrived_before', v_adult_before,
    'children_0_4_arrived_before', v_child_0_4_before,
    'children_5_10_arrived_before', v_child_5_10_before,
    'graduate_arrived_total', v_grad_after,
    'adult_guests_arrived_total', v_adult_after,
    'children_0_4_arrived_total', v_child_0_4_after,
    'children_5_10_arrived_total', v_child_5_10_after,
    'remaining_adult_guests',
      v_registration.registered_adult_guests - v_adult_after,
    'remaining_children_0_4',
      v_registration.registered_children_0_4 - v_child_0_4_after,
    'remaining_children_5_10',
      v_registration.registered_children_5_10 - v_child_5_10_after,
    'recorded_at', v_recorded_at
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'conflict');
end;
$$;

comment on function public.apply_attendance_correction(uuid, uuid, uuid, uuid, integer, integer, integer, integer, text) is
  'Inserts one append-only attendance correction with positive or negative deltas. Verifies an active supervisor or administrator, requires a reason, locks the event and registration, recalculates registration-level attendance under the lock and keeps every final category total within zero and the registered allowance. Never updates or deletes any row and stays idempotent per acting user and request id. Returns safe before-and-after totals with the graduate name only.';

revoke all on function public.apply_attendance_correction(uuid, uuid, uuid, uuid, integer, integer, integer, integer, text) from public;
revoke all on function public.apply_attendance_correction(uuid, uuid, uuid, uuid, integer, integer, integer, integer, text) from anon;
revoke all on function public.apply_attendance_correction(uuid, uuid, uuid, uuid, integer, integer, integer, integer, text) from authenticated;

-- 8. Atomic reversal.
--
-- Inserts one append-only row holding the exact negative of an eligible
-- original entry and links it through reverses_checkin_id. A reversal of a
-- reversal, a second reversal of the same row and a reversal that would
-- create negative attendance are all rejected. Security definer with a
-- fixed empty search_path; execution revoked from public, anon and
-- authenticated.
create or replace function public.reverse_graduation_checkin(
  p_actor_user_id uuid,
  p_event_id uuid,
  p_original_checkin_id uuid,
  p_request_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_supervisor boolean;
  v_event public.graduation_events%rowtype;
  v_registration public.graduation_registrations%rowtype;
  v_original public.graduation_checkins%rowtype;
  v_existing public.graduation_checkins%rowtype;
  v_reason text;
  v_grad_after integer;
  v_adult_after integer;
  v_child_0_4_after integer;
  v_child_5_10_after integer;
  v_recorded_at timestamptz;
begin
  select exists (
    select 1
    from public.staff_profiles
    where user_id = p_actor_user_id
      and is_active
      and role in ('supervisor', 'administrator')
  ) into v_is_supervisor;
  if not v_is_supervisor then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  if p_request_id is null or p_original_checkin_id is null
    or p_event_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;
  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;

  -- Idempotent retry by actor and request id.
  select * into v_existing
  from public.graduation_checkins
  where recorded_by = p_actor_user_id
    and request_id = p_request_id
  limit 1;
  if found and v_existing.registration_id is not null then
    select * into v_registration
    from public.graduation_registrations
    where id = v_existing.registration_id;

    select
      least(greatest(coalesce(sum(graduate_delta), 0), 0), 1),
      least(greatest(coalesce(sum(adult_guest_delta), 0), 0),
        v_registration.registered_adult_guests),
      least(greatest(coalesce(sum(child_0_4_delta), 0), 0),
        v_registration.registered_children_0_4),
      least(greatest(coalesce(sum(child_5_10_delta), 0), 0),
        v_registration.registered_children_5_10)
    into v_grad_after, v_adult_after, v_child_0_4_after, v_child_5_10_after
    from public.graduation_checkins
    where registration_id = v_existing.registration_id;

    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'graduate_name', v_registration.graduate_full_name,
      'registered_adult_guests', v_registration.registered_adult_guests,
      'registered_children_0_4', v_registration.registered_children_0_4,
      'registered_children_5_10', v_registration.registered_children_5_10,
      'graduate_arrived_total', v_grad_after,
      'adult_guests_arrived_total', v_adult_after,
      'children_0_4_arrived_total', v_child_0_4_after,
      'children_5_10_arrived_total', v_child_5_10_after
    );
  end if;

  select * into v_event
  from public.graduation_events
  where id = p_event_id
  for update;
  if not found
    or v_event.status = 'closed'
    or v_event.status = 'archived' then
    return jsonb_build_object('ok', false, 'code', 'configuration_error');
  end if;

  -- Lock the original attendance row.
  select * into v_original
  from public.graduation_checkins
  where id = p_original_checkin_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'entry_not_found');
  end if;

  -- A reversal row can never itself be reversed.
  if v_original.entry_kind = 'reversal' or v_original.action = 'reversal' then
    return jsonb_build_object('ok', false, 'code', 'not_reversible');
  end if;

  -- The original row must not already have been reversed.
  if exists (
    select 1 from public.graduation_checkins
    where reverses_checkin_id = v_original.id
  ) then
    return jsonb_build_object('ok', false, 'code', 'already_reversed');
  end if;

  -- Lock the registration and confirm the original entry belongs to the
  -- active event.
  select * into v_registration
  from public.graduation_registrations
  where id = v_original.registration_id
  for update;
  if not found or v_registration.event_id <> v_event.id then
    return jsonb_build_object('ok', false, 'code', 'registration_blocked');
  end if;

  -- Recalculate current totals under the lock, then apply the exact negative
  -- of the original entry. The result must stay non-negative; if a later
  -- correction already reduced a category, an exact reversal is unsafe and
  -- staff must use a correction instead.
  select
    coalesce(sum(graduate_delta), 0),
    coalesce(sum(adult_guest_delta), 0),
    coalesce(sum(child_0_4_delta), 0),
    coalesce(sum(child_5_10_delta), 0)
  into v_grad_after, v_adult_after, v_child_0_4_after, v_child_5_10_after
  from public.graduation_checkins
  where registration_id = v_registration.id;

  v_grad_after := v_grad_after - v_original.graduate_delta;
  v_adult_after := v_adult_after - v_original.adult_guest_delta;
  v_child_0_4_after := v_child_0_4_after - v_original.child_0_4_delta;
  v_child_5_10_after := v_child_5_10_after - v_original.child_5_10_delta;

  if v_grad_after < 0 or v_adult_after < 0
    or v_child_0_4_after < 0 or v_child_5_10_after < 0 then
    return jsonb_build_object('ok', false, 'code', 'unsafe_reversal');
  end if;

  -- Insert the exact negative copy, classified as a reversal and linked to
  -- the original row. No earlier row is updated or deleted.
  insert into public.graduation_checkins (
    registration_id,
    ticket_id,
    staff_user_id,
    method,
    action,
    entry_kind,
    graduate_delta,
    adult_guest_delta,
    child_0_4_delta,
    child_5_10_delta,
    reason,
    reverses_checkin_id,
    idempotency_key,
    request_id,
    recorded_by,
    is_test
  )
  values (
    v_registration.id,
    v_original.ticket_id,
    p_actor_user_id,
    'supervisor_adjustment',
    'reversal',
    'reversal',
    -v_original.graduate_delta,
    -v_original.adult_guest_delta,
    -v_original.child_0_4_delta,
    -v_original.child_5_10_delta,
    v_reason,
    v_original.id,
    p_actor_user_id::text || ':' || p_request_id::text,
    p_request_id,
    p_actor_user_id,
    v_registration.is_test
  )
  returning created_at into v_recorded_at;

  -- Clamp the reported totals for display safety.
  v_grad_after := least(greatest(v_grad_after, 0), 1);
  v_adult_after := least(greatest(v_adult_after, 0),
    v_registration.registered_adult_guests);
  v_child_0_4_after := least(greatest(v_child_0_4_after, 0),
    v_registration.registered_children_0_4);
  v_child_5_10_after := least(greatest(v_child_5_10_after, 0),
    v_registration.registered_children_5_10);

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'graduate_name', v_registration.graduate_full_name,
    'registered_adult_guests', v_registration.registered_adult_guests,
    'registered_children_0_4', v_registration.registered_children_0_4,
    'registered_children_5_10', v_registration.registered_children_5_10,
    'graduate_arrived_total', v_grad_after,
    'adult_guests_arrived_total', v_adult_after,
    'children_0_4_arrived_total', v_child_0_4_after,
    'children_5_10_arrived_total', v_child_5_10_after,
    'remaining_adult_guests',
      v_registration.registered_adult_guests - v_adult_after,
    'remaining_children_0_4',
      v_registration.registered_children_0_4 - v_child_0_4_after,
    'remaining_children_5_10',
      v_registration.registered_children_5_10 - v_child_5_10_after,
    'recorded_at', v_recorded_at
  );
exception
  when unique_violation then
    -- A concurrent reversal of the same original row wins the partial unique
    -- index; this request rolls back and reports the row as already reversed.
    return jsonb_build_object('ok', false, 'code', 'already_reversed');
end;
$$;

comment on function public.reverse_graduation_checkin(uuid, uuid, uuid, uuid, text) is
  'Inserts one append-only row holding the exact negative of an eligible original attendance entry and links it through reverses_checkin_id. Verifies an active supervisor or administrator, requires a reason, locks the event, original row and registration, rejects reversing a reversal or an already-reversed row, and rejects a reversal that would create negative attendance. Never updates or deletes the original row and stays idempotent per acting user and request id. Returns safe updated totals with the graduate name only.';

revoke all on function public.reverse_graduation_checkin(uuid, uuid, uuid, uuid, text) from public;
revoke all on function public.reverse_graduation_checkin(uuid, uuid, uuid, uuid, text) from anon;
revoke all on function public.reverse_graduation_checkin(uuid, uuid, uuid, uuid, text) from authenticated;
