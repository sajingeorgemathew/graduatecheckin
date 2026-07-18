-- CHECKIN-05 corrective migration: fix the ticket replacement transaction.
--
-- The previously deployed replace_graduation_ticket set
-- replaced_by_ticket_id on the old ticket BEFORE the new ticket row was
-- inserted. The non-deferrable self-referencing foreign key
-- graduation_tickets_replaced_by_ticket_id_fkey is checked at the end of
-- that UPDATE statement, so every replacement failed with SQLSTATE 23503
-- and surfaced as an unhandled HTTP 500. The transaction rolled back, so
-- no data was corrupted.
--
-- This migration only redefines the function. It performs the replacement
-- atomically in a safe order: retire the old ticket first with
-- replaced_by_ticket_id temporarily null, insert the new active ticket
-- (the partial unique index graduation_tickets_one_active_per_registration
-- is satisfied because the old ticket is no longer active), then point
-- replaced_by_ticket_id at the now-existing new ticket. Any failure rolls
-- the whole replacement back, leaving the original ticket active.
--
-- The response carries ticket IDs, ticket codes and statuses only.
-- Raw tokens are never accepted, stored or returned; only the
-- server-computed token hash is written and it is never returned.

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
  -- 1. The acting user must be an active administrator.
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

  -- 2. Validate the reason and every server-generated replacement value.
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

  -- 3. Lock the current ticket so concurrent replacements serialize.
  select * into v_ticket
  from public.graduation_tickets
  where id = p_ticket_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ticket_not_found');
  end if;

  -- 4. Only an active ticket can be replaced. A repeated replacement
  -- request finds status 'replaced' here and returns a structured
  -- conflict instead of an error.
  if v_ticket.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'ticket_not_active');
  end if;

  -- 5. Lock the registration and confirm it remains eligible.
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

  -- 6 + 7. Retire the old ticket first. replaced_by_ticket_id stays null
  -- for now because the new ticket row does not exist yet and the
  -- self-referencing foreign key is checked per statement.
  update public.graduation_tickets
  set status = 'replaced',
      replaced_by_ticket_id = null,
      revoked_at = now(),
      revoked_by = p_actor_user_id,
      revocation_reason = v_reason
  where id = p_ticket_id;

  -- 8. Insert the new active ticket. The partial unique index
  -- graduation_tickets_one_active_per_registration is satisfied because
  -- the registration no longer has an active ticket.
  insert into public.graduation_tickets (
    id, registration_id, ticket_code, token_hash, token_version,
    status, issued_at, issued_by, is_test
  )
  values (
    p_new_ticket_id, v_ticket.registration_id, p_new_ticket_code,
    p_new_token_hash, p_new_token_version, 'active', now(),
    p_actor_user_id, v_ticket.is_test
  );

  -- 9. Point the old ticket at its replacement now that the row exists.
  update public.graduation_tickets
  set replaced_by_ticket_id = p_new_ticket_id
  where id = p_ticket_id;

  -- 10. Record the replacement in the activity log.
  insert into public.ticket_activity_log (
    ticket_id, registration_id, actor_user_id, action,
    previous_ticket_id, replacement_ticket_id, reason, request_id
  )
  values (
    p_ticket_id, v_ticket.registration_id, p_actor_user_id, 'replaced',
    p_ticket_id, p_new_ticket_id, v_reason, p_request_id
  );

  -- 11. Return safe identifiers and statuses only. The raw token and the
  -- token hash are never returned.
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
exception
  -- Expected race outcomes (for example a concurrent insert winning a
  -- unique index) roll back every change above and surface as a
  -- structured conflict instead of an unhandled error. Unexpected errors
  -- still propagate and roll back.
  when unique_violation or foreign_key_violation then
    return jsonb_build_object('ok', false, 'code', 'replacement_conflict');
end;
$$;

comment on function public.replace_graduation_ticket(uuid, uuid, uuid, text, text, integer, text, text) is
  'Replaces one active ticket for an active administrator. Retires the old ticket before inserting the replacement so the one-active-ticket index and the replaced_by_ticket_id foreign key are never violated. Returns ticket IDs, codes and statuses only. Raw tokens and token hashes are never stored in responses or returned.';

revoke all on function public.replace_graduation_ticket(uuid, uuid, uuid, text, text, integer, text, text) from public;
revoke all on function public.replace_graduation_ticket(uuid, uuid, uuid, text, text, integer, text, text) from anon;
revoke all on function public.replace_graduation_ticket(uuid, uuid, uuid, text, text, integer, text, text) from authenticated;
