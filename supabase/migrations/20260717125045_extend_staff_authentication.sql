-- CHECKIN-04: Staff authentication and access roles.
-- Extends staff_profiles for authenticated staff accounts, adds the
-- staff_access_audit_log table and adds a concurrency-safe database
-- function that protects the final active administrator.
--
-- Passwords, password hashes, access tokens, refresh tokens and session
-- cookies are never stored in these tables. Supabase Auth remains the only
-- credential store. This migration never modifies earlier migrations and
-- never deletes existing rows.

-- Extend staff_profiles.
-- email_snapshot mirrors the normalized lowercase Auth email so staff
-- listings never need to query auth.users directly. Existing rows receive
-- an empty-string default, which is migration safe; application code
-- requires a real email for every newly created staff profile.

alter table public.staff_profiles
  add column if not exists email_snapshot text not null default '',
  add column if not exists must_change_password boolean not null default true,
  add column if not exists last_login_at timestamptz,
  add column if not exists created_by uuid references auth.users (id) on delete set null,
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

comment on column public.staff_profiles.email_snapshot is
  'Normalized lowercase copy of the Auth email for staff administration screens. Not a credential.';
comment on column public.staff_profiles.must_change_password is
  'True while the staff member must replace a temporary password before using protected pages.';
comment on column public.staff_profiles.last_login_at is
  'Set after a fully authorized login. Null until the first successful login.';

create index if not exists staff_profiles_email_snapshot_idx
  on public.staff_profiles (lower(email_snapshot));
create index if not exists staff_profiles_active_role_idx
  on public.staff_profiles (is_active, role);

-- Audit action enum

create type public.staff_access_action as enum (
  'staff_created',
  'role_changed',
  'staff_activated',
  'staff_deactivated',
  'temporary_password_reset',
  'password_changed',
  'login_blocked'
);

-- Table: staff_access_audit_log
-- Append-oriented record of staff-account administration actions. The JSON
-- columns hold profile fields only. Passwords, tokens and session cookies
-- are never stored here.

create table public.staff_access_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  target_user_id uuid references auth.users (id) on delete set null,
  action public.staff_access_action not null,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  reason text,
  request_id text,
  created_at timestamptz not null default now(),
  constraint staff_access_audit_log_previous_values_object check (
    jsonb_typeof(previous_values) = 'object'
  ),
  constraint staff_access_audit_log_new_values_object check (
    jsonb_typeof(new_values) = 'object'
  )
);

comment on table public.staff_access_audit_log is
  'Append-oriented audit log for staff-account administration. Never store a password, access token, refresh token or session cookie in any column.';
comment on column public.staff_access_audit_log.request_id is
  'Opaque tracing identifier generated server-side. Must never contain secrets.';

create index staff_access_audit_log_actor_idx
  on public.staff_access_audit_log (actor_user_id);
create index staff_access_audit_log_target_idx
  on public.staff_access_audit_log (target_user_id);
create index staff_access_audit_log_action_idx
  on public.staff_access_audit_log (action);
create index staff_access_audit_log_created_at_idx
  on public.staff_access_audit_log (created_at);

-- Row Level Security. No policies are created, so anon and authenticated
-- roles can never read or write audit rows. Access remains restricted to
-- trusted server-side code using the service role.

alter table public.staff_access_audit_log enable row level security;

revoke all on table public.staff_access_audit_log from anon, authenticated;

-- Function: apply_staff_access_change
-- Atomically applies a role change, deactivation or reactivation while
-- protecting administrator coverage. All active administrator rows are
-- locked before counting, so concurrent requests cannot both remove the
-- final active administrator. Self-deactivation and self-demotion are
-- blocked for administrators. The function returns a JSON object with the
-- previous and new profile values for audit logging, or a structured
-- blocked code. It never touches passwords or tokens.

create or replace function public.apply_staff_access_change(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_new_role public.staff_role,
  p_new_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.staff_profiles%rowtype;
  v_active_admin_count integer;
  v_removes_admin boolean;
begin
  -- Lock the target row so concurrent changes serialize on it.
  select * into v_target
  from public.staff_profiles
  where user_id = p_target_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'staff_not_found');
  end if;

  if p_actor_user_id = p_target_user_id then
    if v_target.is_active and not p_new_is_active then
      return jsonb_build_object('ok', false, 'code', 'self_deactivation_blocked');
    end if;
    if v_target.role = 'administrator' and p_new_role <> 'administrator' then
      return jsonb_build_object('ok', false, 'code', 'self_demotion_blocked');
    end if;
  end if;

  -- Does this change remove an active administrator?
  v_removes_admin :=
    v_target.role = 'administrator'
    and v_target.is_active
    and (p_new_role <> 'administrator' or not p_new_is_active);

  if v_removes_admin then
    -- Lock every active administrator row before counting so a concurrent
    -- request cannot remove another administrator at the same time.
    perform 1
    from public.staff_profiles
    where role = 'administrator' and is_active
    for update;

    select count(*) into v_active_admin_count
    from public.staff_profiles
    where role = 'administrator' and is_active;

    if v_active_admin_count <= 1 then
      return jsonb_build_object('ok', false, 'code', 'final_administrator_protected');
    end if;
  end if;

  update public.staff_profiles
  set role = p_new_role,
      is_active = p_new_is_active,
      updated_by = p_actor_user_id
  where user_id = p_target_user_id;

  return jsonb_build_object(
    'ok', true,
    'previous', jsonb_build_object(
      'role', v_target.role,
      'is_active', v_target.is_active
    ),
    'next', jsonb_build_object(
      'role', p_new_role,
      'is_active', p_new_is_active
    )
  );
end;
$$;

comment on function public.apply_staff_access_change(uuid, uuid, public.staff_role, boolean) is
  'Applies a staff role or activation change with row locks so the final active administrator can never be demoted or deactivated, even by concurrent requests.';

revoke all on function public.apply_staff_access_change(uuid, uuid, public.staff_role, boolean) from public;
revoke all on function public.apply_staff_access_change(uuid, uuid, public.staff_role, boolean) from anon;
revoke all on function public.apply_staff_access_change(uuid, uuid, public.staff_role, boolean) from authenticated;
