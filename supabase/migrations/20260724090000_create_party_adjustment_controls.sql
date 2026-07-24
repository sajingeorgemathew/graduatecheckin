-- HOTFIX-PARTY-01: administrator party adjustment while preserving the ticket.
--
-- Additive only. Nothing in this migration drops, renames, truncates or
-- deletes a table, column, type, index or row created by an earlier deployed
-- migration. It makes exactly two kinds of change:
--
--   1. It relaxes the historic 0-to-2 business limit on a graduate's
--      registered party. The original CHECK constraints capped adult guests
--      and each child group at two and combined children at two. The academy
--      now needs administrators to raise or lower a registered party without
--      any business maximum after a late RSVP, a paid extra guest, a
--      correction or a cancellation. The 0-to-2 caps are therefore replaced
--      with plain non-negative checks. The smallint column type is kept, so
--      counts stay whole numbers within a safe range. No production row is
--      touched: relaxing a CHECK constraint never rewrites data.
--
--   2. It adds an append-only audit table and one security-definer RPC that
--      performs a party adjustment atomically: it locks exactly one
--      registration, verifies an active administrator, supports optimistic
--      concurrency, updates only the selected registration's party counts and
--      adult guest-name rows, writes a before/after audit row and returns the
--      unchanged active ticket ID and code. It never touches
--      graduation_tickets, never issues or replaces a ticket, and never reads
--      or writes a check-in.
--
-- The production_import_graduates reconciliation limits are deliberately left
-- unchanged: the Excel import keeps its 0-to-2 rules, and imported graduates
-- who later need more guests are updated through this feature instead.
--
-- RLS is enabled with no policies and direct privileges are revoked, matching
-- every existing table in this schema. Only trusted server-side service-role
-- code touches these rows.

-- ---------------------------------------------------------------------
-- 1. Relax the registered-party business limits (no business maximum).
--
-- Dropping and re-adding these CHECK constraints is the entire point of the
-- hotfix; it is not a destructive data operation. The generated
-- expected_party_size column is left exactly as it is.
-- ---------------------------------------------------------------------

alter table public.graduation_registrations
  drop constraint if exists graduation_registrations_adults_range;
alter table public.graduation_registrations
  drop constraint if exists graduation_registrations_children_0_4_range;
alter table public.graduation_registrations
  drop constraint if exists graduation_registrations_children_5_10_range;
alter table public.graduation_registrations
  drop constraint if exists graduation_registrations_children_combined;

alter table public.graduation_registrations
  add constraint graduation_registrations_adults_non_negative
    check (registered_adult_guests >= 0);
alter table public.graduation_registrations
  add constraint graduation_registrations_children_0_4_non_negative
    check (registered_children_0_4 >= 0);
alter table public.graduation_registrations
  add constraint graduation_registrations_children_5_10_non_negative
    check (registered_children_5_10 >= 0);

-- ---------------------------------------------------------------------
-- 2. Table: graduation_party_adjustments
--
-- Append-only audit of every administrator party adjustment. One row records
-- the complete before and after party, the required reason, an optional
-- payment or approval note, the actor, the timestamp and the idempotency key.
-- Updates and deletes are blocked by a trigger. The unique idempotency key
-- makes a double-submit record exactly one adjustment.
-- ---------------------------------------------------------------------

create table if not exists public.graduation_party_adjustments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete restrict,
  registration_id uuid not null
    references public.graduation_registrations (id) on delete restrict,
  ticket_id uuid
    references public.graduation_tickets (id) on delete restrict,
  idempotency_key text not null,
  reason text not null,
  payment_note text,
  before_party jsonb not null,
  after_party jsonb not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint graduation_party_adjustments_idempotency_unique unique (
    idempotency_key
  ),
  constraint graduation_party_adjustments_reason_length check (
    length(btrim(reason)) >= 5 and length(reason) <= 500
  ),
  constraint graduation_party_adjustments_before_is_object check (
    jsonb_typeof(before_party) = 'object'
  ),
  constraint graduation_party_adjustments_after_is_object check (
    jsonb_typeof(after_party) = 'object'
  )
);

comment on table public.graduation_party_adjustments is
  'Append-only audit of administrator party adjustments. A row exists only because an administrator raised or lowered one graduate registered party through update_graduation_registration_party. The same active ticket and QR are preserved; this table never records a ticket change. Updates and deletes are blocked by a trigger.';
comment on column public.graduation_party_adjustments.idempotency_key is
  'Client-supplied key preventing an accidental double-submit from recording two adjustments for the same change.';
comment on column public.graduation_party_adjustments.ticket_id is
  'The graduate active ticket at the moment of adjustment, when one exists. Recorded for audit only; the ticket itself is never modified.';

create index if not exists graduation_party_adjustments_registration_idx
  on public.graduation_party_adjustments (registration_id);
create index if not exists graduation_party_adjustments_event_idx
  on public.graduation_party_adjustments (event_id);
create index if not exists graduation_party_adjustments_changed_at_idx
  on public.graduation_party_adjustments (changed_at desc);

create or replace function public.guard_party_adjustment_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception
    'graduation_party_adjustments is append-only. Record a new adjustment instead.';
  return null;
end;
$$;

comment on function public.guard_party_adjustment_append_only() is
  'Blocks updates and deletes so the party-adjustment audit stays append-only.';

drop trigger if exists graduation_party_adjustments_append_only
  on public.graduation_party_adjustments;
create trigger graduation_party_adjustments_append_only
  before update or delete on public.graduation_party_adjustments
  for each row execute function public.guard_party_adjustment_append_only();

-- ---------------------------------------------------------------------
-- 3. Function: update_graduation_registration_party
--
-- Atomically adjusts one graduate registered party. The same active ticket,
-- ticket code, QR token and token hash are preserved: this function never
-- writes graduation_tickets and never issues or replaces a ticket. It only
-- updates the selected registration's party counts, replaces that
-- registration's adult guest-name rows and writes one append-only audit row.
--
--  - Verifies the actor is an active administrator.
--  - Locks exactly one registration with FOR UPDATE.
--  - Rejects a closed or archived event.
--  - Supports optimistic concurrency on the registration updated_at.
--  - Rejects null or negative counts. Imposes no business maximum.
--  - Validates the adult guest names are an array of strings and rejects more
--    names than the adult guest count. Preserves the unnamed-guest allowance.
--  - Returns a clear no-change result, writing nothing, when the proposed
--    party exactly matches the current party.
--  - Is idempotent on the supplied key: a repeat returns the original result
--    without applying a second update.
-- ---------------------------------------------------------------------

create or replace function public.update_graduation_registration_party(
  p_actor_user_id uuid,
  p_registration_id uuid,
  p_adult_guest_count integer,
  p_adult_guest_names jsonb,
  p_children_0_4 integer,
  p_children_5_10 integer,
  p_reason text,
  p_payment_note text,
  p_idempotency_key text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_registration public.graduation_registrations%rowtype;
  v_event public.graduation_events%rowtype;
  v_existing public.graduation_party_adjustments%rowtype;
  v_reason text;
  v_payment_note text;
  v_before_names jsonb;
  v_after_names jsonb;
  v_before jsonb;
  v_after jsonb;
  v_no_change boolean;
  v_name text;
  v_sort integer;
  v_ticket_id uuid;
  v_ticket_code text;
  v_adjustment_id uuid;
begin
  -- 1. Idempotency. A repeated key returns the original adjustment untouched.
  select * into v_existing
  from public.graduation_party_adjustments
  where idempotency_key = p_idempotency_key;
  if found then
    select id, ticket_code into v_ticket_id, v_ticket_code
    from public.graduation_tickets
    where registration_id = v_existing.registration_id and status = 'active';
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'no_change', false,
      'adjustment_id', v_existing.id,
      'registration_id', v_existing.registration_id,
      'ticket_id', v_ticket_id,
      'ticket_code', v_ticket_code,
      'before_party', v_existing.before_party,
      'after_party', v_existing.after_party
    );
  end if;

  -- 2. The acting user must be an active administrator.
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

  -- 3. Validate the required reason.
  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    return jsonb_build_object('ok', false, 'code', 'invalid_reason');
  end if;
  v_payment_note := nullif(btrim(coalesce(p_payment_note, '')), '');

  -- 4. Non-negative whole-number counts. No business maximum is imposed.
  if p_adult_guest_count is null
    or p_children_0_4 is null
    or p_children_5_10 is null
    or p_adult_guest_count < 0
    or p_children_0_4 < 0
    or p_children_5_10 < 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_counts');
  end if;

  -- 5. Adult guest names: an array of strings, never more than the count.
  if p_adult_guest_names is null
    or jsonb_typeof(p_adult_guest_names) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'invalid_guest_names');
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_adult_guest_names) as element
    where jsonb_typeof(element) <> 'string'
  ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_guest_names');
  end if;
  if jsonb_array_length(p_adult_guest_names) > p_adult_guest_count then
    return jsonb_build_object('ok', false, 'code', 'too_many_guest_names');
  end if;

  -- 6. Lock exactly one registration.
  select * into v_registration
  from public.graduation_registrations
  where id = p_registration_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'registration_not_found');
  end if;

  -- 7. The registration's event must be open.
  select * into v_event
  from public.graduation_events
  where id = v_registration.event_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'event_not_found');
  end if;
  if v_event.status in ('closed', 'archived') then
    return jsonb_build_object('ok', false, 'code', 'event_not_open');
  end if;

  -- 8. Optimistic concurrency: reject a stale expected updated_at.
  if p_expected_updated_at is not null
    and v_registration.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok', false, 'code', 'stale_registration');
  end if;

  -- 9. Complete before snapshot, then the proposed after snapshot. The
  --    current adult names are read in display order and limited to the
  --    currently registered adult count, exactly as the ticket shows them.
  with adult as (
    select btrim(guest_name) as name, sort_order
    from public.registration_guests
    where registration_id = v_registration.id
      and guest_category = 'adult'
      and guest_name is not null
      and btrim(guest_name) <> ''
    order by sort_order
    limit greatest(v_registration.registered_adult_guests, 0)
  )
  select coalesce(jsonb_agg(name order by sort_order), '[]'::jsonb)
  into v_before_names
  from adult;

  with provided as (
    select btrim(value) as name, ordinality as ord
    from jsonb_array_elements_text(p_adult_guest_names)
      with ordinality
    where btrim(value) <> ''
    order by ordinality
    limit p_adult_guest_count
  )
  select coalesce(jsonb_agg(name order by ord), '[]'::jsonb)
  into v_after_names
  from provided;

  v_before := jsonb_build_object(
    'graduate_name', v_registration.graduate_full_name,
    'graduate_count', 1,
    'adult_guest_names', v_before_names,
    'adult_guest_count', v_registration.registered_adult_guests,
    'child_0_4_count', v_registration.registered_children_0_4,
    'child_5_10_count', v_registration.registered_children_5_10,
    'total_party_count',
      1 + v_registration.registered_adult_guests
        + v_registration.registered_children_0_4
        + v_registration.registered_children_5_10
  );
  v_after := jsonb_build_object(
    'graduate_name', v_registration.graduate_full_name,
    'graduate_count', 1,
    'adult_guest_names', v_after_names,
    'adult_guest_count', p_adult_guest_count,
    'child_0_4_count', p_children_0_4,
    'child_5_10_count', p_children_5_10,
    'total_party_count',
      1 + p_adult_guest_count + p_children_0_4 + p_children_5_10
  );

  -- 10. No-op safety. When the proposed party exactly matches the current
  --     party nothing is written: no audit row and no second update, so a
  --     duplicate adjustment event is never created and no new PDF is cued.
  v_no_change := (
    v_registration.registered_adult_guests = p_adult_guest_count
    and v_registration.registered_children_0_4 = p_children_0_4
    and v_registration.registered_children_5_10 = p_children_5_10
    and v_before_names = v_after_names
  );

  select id, ticket_code into v_ticket_id, v_ticket_code
  from public.graduation_tickets
  where registration_id = v_registration.id and status = 'active';

  if v_no_change then
    return jsonb_build_object(
      'ok', true,
      'duplicate', false,
      'no_change', true,
      'adjustment_id', null,
      'registration_id', v_registration.id,
      'ticket_id', v_ticket_id,
      'ticket_code', v_ticket_code,
      'before_party', v_before,
      'after_party', v_after
    );
  end if;

  -- 11. Update only the selected registration's party counts. No other
  --     registration field and no ticket is touched. updated_at advances
  --     through the existing set_updated_at trigger.
  update public.graduation_registrations
  set registered_adult_guests = p_adult_guest_count,
      registered_children_0_4 = p_children_0_4,
      registered_children_5_10 = p_children_5_10
  where id = v_registration.id;

  -- 12. Replace only this registration's adult guest-name rows. Child detail
  --     rows are counted, never named, and are left untouched.
  delete from public.registration_guests
  where registration_id = v_registration.id
    and guest_category = 'adult';

  v_sort := 0;
  for v_name in
    select name
    from (
      select btrim(value) as name, ordinality as ord
      from jsonb_array_elements_text(p_adult_guest_names)
        with ordinality
      where btrim(value) <> ''
      order by ordinality
    ) ordered
  loop
    v_sort := v_sort + 1;
    exit when v_sort > p_adult_guest_count;
    insert into public.registration_guests (
      registration_id, guest_category, guest_name, sort_order, is_test
    ) values (
      v_registration.id, 'adult', v_name, v_sort, v_registration.is_test
    );
  end loop;

  -- 13. One append-only audit row.
  insert into public.graduation_party_adjustments (
    event_id,
    registration_id,
    ticket_id,
    idempotency_key,
    reason,
    payment_note,
    before_party,
    after_party,
    changed_by
  ) values (
    v_registration.event_id,
    v_registration.id,
    v_ticket_id,
    p_idempotency_key,
    v_reason,
    v_payment_note,
    v_before,
    v_after,
    p_actor_user_id
  )
  returning id into v_adjustment_id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'no_change', false,
    'adjustment_id', v_adjustment_id,
    'registration_id', v_registration.id,
    'ticket_id', v_ticket_id,
    'ticket_code', v_ticket_code,
    'before_party', v_before,
    'after_party', v_after
  );
exception
  when unique_violation then
    -- A concurrent call recorded this idempotency key first. The whole
    -- adjustment above is rolled back and the original result is returned, so
    -- a double-submit never applies a second update.
    select * into v_existing
    from public.graduation_party_adjustments
    where idempotency_key = p_idempotency_key;
    if found then
      select id, ticket_code into v_ticket_id, v_ticket_code
      from public.graduation_tickets
      where registration_id = v_existing.registration_id and status = 'active';
      return jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'no_change', false,
        'adjustment_id', v_existing.id,
        'registration_id', v_existing.registration_id,
        'ticket_id', v_ticket_id,
        'ticket_code', v_ticket_code,
        'before_party', v_existing.before_party,
        'after_party', v_existing.after_party
      );
    end if;
    raise;
end;
$$;

comment on function public.update_graduation_registration_party(
  uuid, uuid, integer, jsonb, integer, integer, text, text, text, timestamptz
) is
  'Atomically adjusts one graduate registered party while preserving the same active ticket and QR. Verifies an active administrator, locks one registration, supports optimistic concurrency, imposes no business maximum, writes an append-only before/after audit row and returns the unchanged ticket ID and code. Never writes graduation_tickets, never issues or replaces a ticket and never touches a check-in. Idempotent on the supplied key.';

-- ---------------------------------------------------------------------
-- 4. Row Level Security and privilege revocation.
-- Enabled with no policies so anon and authenticated cannot read or write any
-- row. Direct table and function privileges are revoked as well. Only trusted
-- server-side service-role code touches these objects.
-- ---------------------------------------------------------------------

alter table public.graduation_party_adjustments enable row level security;

revoke all on table public.graduation_party_adjustments
  from public, anon, authenticated;

revoke all on function public.update_graduation_registration_party(
  uuid, uuid, integer, jsonb, integer, integer, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.guard_party_adjustment_append_only()
  from public, anon, authenticated;
