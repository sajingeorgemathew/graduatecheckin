-- CHECKIN-07: graduate and guest arrival check-in workflow.
--
-- This migration is additive only. It never drops, deletes, renames or
-- alters previously deployed objects. It reuses the existing
-- graduation_checkins table and its existing attendance delta columns
-- (graduate_delta, adult_guest_delta, child_0_4_delta, child_5_10_delta)
-- and never creates duplicate attendance columns.
--
-- Attendance belongs to the registration, never to a single ticket. Every
-- current total is recalculated across all graduation_checkins rows of the
-- registration, so replacing a ticket never resets or duplicates
-- attendance. CHECKIN-07 records positive admission deltas only.
-- Corrections and reversals remain for CHECKIN-08.
--
-- Privacy: the new metadata columns store identifiers only. No QR payload,
-- raw token, token hash, ticket code, graduate name, email, phone, guest
-- name or payment value is ever stored here.

-- 1. Add only the missing metadata columns. All three are nullable so
-- every legacy row stays valid; new CHECKIN-07 inserts always provide
-- them. The delta columns already exist and are reused as is.
alter table public.graduation_checkins
  add column if not exists request_id uuid;

alter table public.graduation_checkins
  add column if not exists validation_attempt_id uuid
    references public.ticket_scan_attempts (id);

alter table public.graduation_checkins
  add column if not exists recorded_by uuid
    references auth.users (id);

comment on column public.graduation_checkins.request_id is
  'Client-generated UUID for one confirmation action. Combined with recorded_by it keeps duplicate submissions and network retries idempotent. Legacy rows created before CHECKIN-07 leave this null.';
comment on column public.graduation_checkins.validation_attempt_id is
  'The ticket_scan_attempts row whose successful validation authorized this admission. A validation attempt may authorize at most one positive admission. Legacy rows leave this null.';
comment on column public.graduation_checkins.recorded_by is
  'The authenticated staff user who recorded this arrival. Legacy rows leave this null.';

-- 2. A validation attempt may authorize at most one positive admission.
create unique index if not exists
  graduation_checkins_validation_attempt_unique
  on public.graduation_checkins (validation_attempt_id)
  where validation_attempt_id is not null;

-- 3. One successful result per acting staff user and request id keeps
-- duplicate clicks and network retries idempotent.
create unique index if not exists
  graduation_checkins_recorded_by_request_unique
  on public.graduation_checkins (recorded_by, request_id)
  where recorded_by is not null and request_id is not null;

-- 4. Supporting indexes for registration-level totals and audit lookups.
-- The registration, ticket and staff_user indexes already exist from the
-- CHECKIN-02 schema; only the genuinely new access paths are added here.
create index if not exists graduation_checkins_registration_created_idx
  on public.graduation_checkins (registration_id, created_at);

create index if not exists graduation_checkins_recorded_by_idx
  on public.graduation_checkins (recorded_by);

-- 5. Atomic arrival confirmation.
--
-- Records one append-only admission for a previously validated ticket. The
-- whole sequence runs in one transaction: any failure rolls everything
-- back. The function is security definer with a fixed empty search_path and
-- has its execution revoked from public, anon and authenticated so only
-- trusted server-side code using the service role may call it.
--
-- p_event_id is the server-resolved active event id. It is never accepted
-- from the browser; the API route resolves it and passes it here, and the
-- function still cross-checks it against the validation attempt.
create or replace function public.apply_graduation_checkin(
  p_actor_user_id uuid,
  p_event_id uuid,
  p_validation_attempt_id uuid,
  p_request_id uuid,
  p_graduate_arriving integer,
  p_adult_guests_arriving integer,
  p_children_0_4_arriving integer,
  p_children_5_10_arriving integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_staff boolean;
  v_attempt public.ticket_scan_attempts%rowtype;
  v_event public.graduation_events%rowtype;
  v_ticket public.graduation_tickets%rowtype;
  v_registration public.graduation_registrations%rowtype;
  v_existing public.graduation_checkins%rowtype;
  v_method public.checkin_method;
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
  -- 1. The acting user must be an active scanner, supervisor or
  -- administrator. This repeats the API authorization as defense in depth.
  select exists (
    select 1
    from public.staff_profiles
    where user_id = p_actor_user_id
      and is_active
      and role in ('scanner', 'supervisor', 'administrator')
  ) into v_is_staff;
  if not v_is_staff then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  -- 2. The request id and validation attempt id are required.
  if p_request_id is null or p_validation_attempt_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_counts');
  end if;

  -- 3. Idempotent retry: a duplicate click or a network retry reuses the
  -- same actor and request id. Return the already-recorded result without
  -- inserting a second row.
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
      'result', case when v_arrived_total >= v_expected
        then 'complete' else 'partial' end,
      'idempotent', true,
      'graduate_name', v_registration.graduate_full_name,
      'ticket_code', (
        select ticket_code from public.graduation_tickets
        where id = v_existing.ticket_id
      ),
      'registered_adult_guests', v_registration.registered_adult_guests,
      'registered_children_0_4', v_registration.registered_children_0_4,
      'registered_children_5_10', v_registration.registered_children_5_10,
      'expected_party_size', v_expected,
      'graduate_arriving_now', v_existing.graduate_delta,
      'adult_guests_arriving_now', v_existing.adult_guest_delta,
      'children_0_4_arriving_now', v_existing.child_0_4_delta,
      'children_5_10_arriving_now', v_existing.child_5_10_delta,
      'graduate_arrived_before',
        greatest(v_grad_total - v_existing.graduate_delta, 0),
      'adult_guests_arrived_before',
        greatest(v_adult_total - v_existing.adult_guest_delta, 0),
      'children_0_4_arrived_before',
        greatest(v_child_0_4_total - v_existing.child_0_4_delta, 0),
      'children_5_10_arrived_before',
        greatest(v_child_5_10_total - v_existing.child_5_10_delta, 0),
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

  -- 4. Lock the validation attempt so concurrent confirmations of the same
  -- attempt serialize.
  select * into v_attempt
  from public.ticket_scan_attempts
  where id = p_validation_attempt_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'validation_used');
  end if;

  -- 5. The attempt must belong to the acting staff user.
  if v_attempt.staff_user_id <> p_actor_user_id then
    return jsonb_build_object('ok', false, 'code', 'validation_used');
  end if;

  -- 6. The attempt must reference a ticket and registration and belong to
  -- the server-resolved active event.
  if v_attempt.ticket_id is null
    or v_attempt.registration_id is null
    or v_attempt.event_id is null then
    return jsonb_build_object('ok', false, 'code', 'validation_used');
  end if;
  if v_attempt.event_id <> p_event_id then
    return jsonb_build_object('ok', false, 'code', 'wrong_event');
  end if;

  -- 7. A successful validation may confirm attendance for 15 minutes only.
  if v_attempt.created_at < now() - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'code', 'validation_expired');
  end if;

  -- 8. Only a valid or partially-checked-in validation may admit. An
  -- already-checked-in attempt can never create another positive
  -- admission. Any other result never reaches confirmation.
  if v_attempt.result = 'already_checked_in' then
    return jsonb_build_object('ok', false, 'code', 'already_complete');
  end if;
  if v_attempt.result not in ('valid', 'partially_checked_in') then
    if v_attempt.result in ('revoked', 'replaced', 'pending') then
      return jsonb_build_object('ok', false, 'code', 'ticket_not_active');
    elsif v_attempt.result = 'wrong_event' then
      return jsonb_build_object('ok', false, 'code', 'wrong_event');
    elsif v_attempt.result = 'registration_blocked' then
      return jsonb_build_object('ok', false, 'code', 'registration_blocked');
    end if;
    return jsonb_build_object('ok', false, 'code', 'validation_used');
  end if;

  -- 9. The attempt may be consumed only once. A prior admission already
  -- references it (and was not the current idempotent request).
  if exists (
    select 1 from public.graduation_checkins
    where validation_attempt_id = p_validation_attempt_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'validation_used');
  end if;

  -- 10. Lock and revalidate the configured event.
  select * into v_event
  from public.graduation_events
  where id = p_event_id
  for update;
  -- A missing, closed or archived event fails safely. Draft and active
  -- events are accepted, matching the server-side active-event resolver.
  if not found
    or v_event.status = 'closed'
    or v_event.status = 'archived' then
    return jsonb_build_object('ok', false, 'code', 'configuration_error');
  end if;

  -- 11. Lock and recheck the ticket. It must still be active. This catches
  -- a ticket revoked or replaced after validation.
  select * into v_ticket
  from public.graduation_tickets
  where id = v_attempt.ticket_id
  for update;
  if not found or v_ticket.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'ticket_not_active');
  end if;

  -- 12. Lock and recheck the registration. It must remain eligible. This
  -- catches a registration cancelled or set to review after validation.
  select * into v_registration
  from public.graduation_registrations
  where id = v_attempt.registration_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'registration_blocked');
  end if;
  if v_registration.registration_status <> 'eligible' then
    return jsonb_build_object('ok', false, 'code', 'registration_blocked');
  end if;

  -- 13. Ticket, registration, validation attempt and active event must all
  -- describe the same admission.
  if v_ticket.registration_id <> v_registration.id
    or v_registration.event_id <> v_event.id
    or v_attempt.registration_id <> v_registration.id
    or v_attempt.ticket_id <> v_ticket.id then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;

  -- 14. Sum attendance deltas across every check-in row of the
  -- registration, then clamp each category between zero and its registered
  -- allowance. This is computed under the registration lock taken above.
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

  -- 15. The registration may already be fully admitted, for example
  -- through an earlier ticket that this one replaced. It must never receive
  -- a second full admission.
  if v_grad_before + v_adult_before + v_child_0_4_before + v_child_5_10_before
    >= v_expected then
    return jsonb_build_object('ok', false, 'code', 'already_complete');
  end if;

  -- 16. Validate the arriving-now values. Each must be a non-negative
  -- integer; the graduate is 0 or 1; at least one person must arrive.
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

  -- 17. A single arrival can never exceed the registered allowance for its
  -- category. This is a fundamentally invalid request.
  if p_graduate_arriving > 1
    or p_adult_guests_arriving > v_registration.registered_adult_guests
    or p_children_0_4_arriving > v_registration.registered_children_0_4
    or p_children_5_10_arriving > v_registration.registered_children_5_10 then
    return jsonb_build_object('ok', false, 'code', 'allowance_exceeded');
  end if;

  -- 18. The arrival must fit within the remaining allowance computed under
  -- the lock. When it does not, someone was admitted concurrently; the
  -- request loses the race and receives a conflict with refreshed totals.
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

  -- 19. Insert one append-only admission. Only positive deltas are written.
  -- The reused idempotency_key column stays satisfied with a value unique
  -- per acting user and request id.
  v_method := case v_attempt.method
    when 'qr' then 'qr_scan'::public.checkin_method
    else 'manual_search'::public.checkin_method
  end;

  insert into public.graduation_checkins (
    registration_id,
    ticket_id,
    staff_user_id,
    method,
    action,
    graduate_delta,
    adult_guest_delta,
    child_0_4_delta,
    child_5_10_delta,
    idempotency_key,
    request_id,
    validation_attempt_id,
    recorded_by,
    is_test
  )
  values (
    v_registration.id,
    v_ticket.id,
    p_actor_user_id,
    v_method,
    'admission',
    p_graduate_arriving,
    p_adult_guests_arriving,
    p_children_0_4_arriving,
    p_children_5_10_arriving,
    p_actor_user_id::text || ':' || p_request_id::text,
    p_request_id,
    p_validation_attempt_id,
    p_actor_user_id,
    v_registration.is_test
  )
  returning created_at into v_recorded_at;

  -- 20. Build the safe response from the new totals.
  v_grad_total := v_grad_before + p_graduate_arriving;
  v_adult_total := v_adult_before + p_adult_guests_arriving;
  v_child_0_4_total := v_child_0_4_before + p_children_0_4_arriving;
  v_child_5_10_total := v_child_5_10_before + p_children_5_10_arriving;
  v_arrived_total := v_grad_total + v_adult_total + v_child_0_4_total
    + v_child_5_10_total;

  return jsonb_build_object(
    'ok', true,
    'result', case when v_arrived_total >= v_expected
      then 'complete' else 'partial' end,
    'idempotent', false,
    'graduate_name', v_registration.graduate_full_name,
    'ticket_code', v_ticket.ticket_code,
    'registered_adult_guests', v_registration.registered_adult_guests,
    'registered_children_0_4', v_registration.registered_children_0_4,
    'registered_children_5_10', v_registration.registered_children_5_10,
    'expected_party_size', v_expected,
    'graduate_arriving_now', p_graduate_arriving,
    'adult_guests_arriving_now', p_adult_guests_arriving,
    'children_0_4_arriving_now', p_children_0_4_arriving,
    'children_5_10_arriving_now', p_children_5_10_arriving,
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
  -- A concurrent admission that wins the unique validation-attempt index or
  -- the per-actor request index rolls this whole block back and surfaces as
  -- a structured conflict rather than an unhandled error.
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'conflict');
end;
$$;

comment on function public.apply_graduation_checkin(uuid, uuid, uuid, uuid, integer, integer, integer, integer) is
  'Records one append-only positive admission for a previously validated ticket. Locks the validation attempt, event, ticket and registration; rechecks every status; recalculates registration-level attendance under the lock; enforces registered allowances; consumes the validation attempt once; and stays idempotent per acting user and request id. Inserts one graduation_checkins row with positive deltas only and never updates, deletes, reverses or changes allowances, ticket status or payment status. Returns safe attendance totals with the graduate name and ticket code only; no raw token, token hash, QR payload, email, phone, guest name, payment value or database UUID for the check-in, registration or ticket is returned.';

revoke all on function public.apply_graduation_checkin(uuid, uuid, uuid, uuid, integer, integer, integer, integer) from public;
revoke all on function public.apply_graduation_checkin(uuid, uuid, uuid, uuid, integer, integer, integer, integer) from anon;
revoke all on function public.apply_graduation_checkin(uuid, uuid, uuid, uuid, integer, integer, integer, integer) from authenticated;
