-- CHECKIN-02: Initial graduation check-in schema.
-- Creates the core event, registration, guest, ticket, staff and check-in
-- tables with strict constraints, Row Level Security and no public access.
-- Test records must remain separated from production records at all times.

-- Required extensions
create extension if not exists pgcrypto;

-- Enum types

create type public.graduation_event_status as enum (
  'draft',
  'active',
  'closed',
  'archived'
);

create type public.registration_source as enum (
  'mock',
  'registration_export',
  'manual'
);

create type public.registration_status as enum (
  'eligible',
  'review_required',
  'cancelled',
  'failed'
);

create type public.payment_status as enum (
  'unknown',
  'amount_recorded',
  'paid',
  'pending',
  'failed',
  'refunded',
  'waived'
);

create type public.guest_category as enum (
  'adult',
  'child_0_4',
  'child_5_10'
);

create type public.ticket_status as enum (
  'pending',
  'active',
  'revoked',
  'replaced'
);

create type public.staff_role as enum (
  'scanner',
  'supervisor',
  'administrator'
);

create type public.checkin_method as enum (
  'qr_scan',
  'manual_search',
  'supervisor_adjustment',
  'system'
);

create type public.checkin_action as enum (
  'admission',
  'correction',
  'reversal'
);

-- Reusable updated_at trigger function

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Sets updated_at to the current time before an update on mutable tables.';

-- Table 1: graduation_events

create table public.graduation_events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null,
  event_name text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'America/Toronto',
  venue_name text,
  venue_address text,
  status public.graduation_event_status not null default 'draft',
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint graduation_events_event_code_unique unique (event_code),
  constraint graduation_events_time_order check (
    starts_at is null or ends_at is null or starts_at < ends_at
  )
);

comment on table public.graduation_events is
  'Graduation ceremonies. Test events carry is_test true and must stay separated from production events.';
comment on column public.graduation_events.is_test is
  'True marks development or test data. Destructive tooling may only target test records.';

create index graduation_events_event_code_idx
  on public.graduation_events (event_code);
create index graduation_events_status_idx
  on public.graduation_events (status);
create index graduation_events_is_test_idx
  on public.graduation_events (is_test);

create trigger graduation_events_set_updated_at
  before update on public.graduation_events
  for each row execute function public.set_updated_at();

-- Table 2: graduation_registrations

create table public.graduation_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete cascade,
  registration_code text not null,
  source_system public.registration_source not null,
  source_registration_id text,
  graduate_full_name text not null,
  email text,
  phone text,
  gown_size text,
  name_pronunciation text,
  registered_adult_guests smallint not null default 0,
  registered_children_0_4 smallint not null default 0,
  registered_children_5_10 smallint not null default 0,
  expected_party_size smallint generated always as (
    1 + registered_adult_guests
      + registered_children_0_4
      + registered_children_5_10
  ) stored,
  registration_status public.registration_status not null
    default 'review_required',
  payment_status public.payment_status not null default 'unknown',
  fee_total numeric(10, 2),
  tax_total numeric(10, 2),
  order_total numeric(10, 2),
  source_order_date timestamptz,
  internal_notes text,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint graduation_registrations_code_unique unique (registration_code),
  constraint graduation_registrations_adults_range check (
    registered_adult_guests between 0 and 2
  ),
  constraint graduation_registrations_children_0_4_range check (
    registered_children_0_4 between 0 and 2
  ),
  constraint graduation_registrations_children_5_10_range check (
    registered_children_5_10 between 0 and 2
  ),
  constraint graduation_registrations_children_combined check (
    registered_children_0_4 + registered_children_5_10 <= 2
  ),
  constraint graduation_registrations_fee_total_not_negative check (
    fee_total is null or fee_total >= 0
  ),
  constraint graduation_registrations_tax_total_not_negative check (
    tax_total is null or tax_total >= 0
  ),
  constraint graduation_registrations_order_total_not_negative check (
    order_total is null or order_total >= 0
  )
);

comment on table public.graduation_registrations is
  'Graduate registrations per event. Stores expected party counts as the source of truth. Never store QR tokens here.';
comment on column public.graduation_registrations.is_test is
  'True marks development or test data. Test records must stay separated from production records.';

create unique index graduation_registrations_source_lookup_key
  on public.graduation_registrations (event_id, source_system, source_registration_id)
  where source_registration_id is not null;

create index graduation_registrations_event_idx
  on public.graduation_registrations (event_id);
create index graduation_registrations_status_idx
  on public.graduation_registrations (registration_status);
create index graduation_registrations_payment_idx
  on public.graduation_registrations (payment_status);
create index graduation_registrations_name_search_idx
  on public.graduation_registrations (lower(graduate_full_name));
create index graduation_registrations_email_search_idx
  on public.graduation_registrations (lower(email));
create index graduation_registrations_phone_idx
  on public.graduation_registrations (phone);
create index graduation_registrations_is_test_idx
  on public.graduation_registrations (is_test);

create trigger graduation_registrations_set_updated_at
  before update on public.graduation_registrations
  for each row execute function public.set_updated_at();

-- Table 3: registration_guests

create table public.registration_guests (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null
    references public.graduation_registrations (id) on delete cascade,
  guest_category public.guest_category not null,
  guest_name text,
  sort_order smallint not null,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_guests_sort_order_positive check (sort_order > 0),
  constraint registration_guests_slot_unique unique (
    registration_id, guest_category, sort_order
  )
);

comment on table public.registration_guests is
  'Optional named guest detail rows. The registration row remains the source of truth for registered party counts.';

create index registration_guests_registration_idx
  on public.registration_guests (registration_id);
create index registration_guests_category_idx
  on public.registration_guests (guest_category);

create trigger registration_guests_set_updated_at
  before update on public.registration_guests
  for each row execute function public.set_updated_at();

-- Table 4: graduation_tickets

create table public.graduation_tickets (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null
    references public.graduation_registrations (id) on delete cascade,
  ticket_code text not null,
  token_hash text not null,
  status public.ticket_status not null default 'pending',
  issued_at timestamptz,
  sent_at timestamptz,
  revoked_at timestamptz,
  replaced_by_ticket_id uuid references public.graduation_tickets (id),
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint graduation_tickets_code_unique unique (ticket_code),
  constraint graduation_tickets_token_hash_unique unique (token_hash)
);

comment on table public.graduation_tickets is
  'QR admission tickets. Only a secure hash of the ticket token is stored.';
comment on column public.graduation_tickets.token_hash is
  'Secure hash of the QR ticket token. The raw QR token must never be stored anywhere in the database.';

create index graduation_tickets_registration_idx
  on public.graduation_tickets (registration_id);
create index graduation_tickets_status_idx
  on public.graduation_tickets (status);
create index graduation_tickets_token_hash_idx
  on public.graduation_tickets (token_hash);
create unique index graduation_tickets_one_active_per_registration
  on public.graduation_tickets (registration_id)
  where status = 'active';

create trigger graduation_tickets_set_updated_at
  before update on public.graduation_tickets
  for each row execute function public.set_updated_at();

-- Table 5: staff_profiles

create table public.staff_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role public.staff_role not null default 'scanner',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.staff_profiles is
  'Staff profile per Supabase Auth user. Access policies arrive with staff authentication in CHECKIN-04.';

create index staff_profiles_role_idx
  on public.staff_profiles (role);
create index staff_profiles_is_active_idx
  on public.staff_profiles (is_active);

create trigger staff_profiles_set_updated_at
  before update on public.staff_profiles
  for each row execute function public.set_updated_at();

-- Table 6: graduation_checkins

create table public.graduation_checkins (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null
    references public.graduation_registrations (id) on delete cascade,
  ticket_id uuid references public.graduation_tickets (id),
  staff_user_id uuid references auth.users (id),
  staff_name_snapshot text,
  method public.checkin_method not null,
  action public.checkin_action not null,
  graduate_delta smallint not null default 0,
  adult_guest_delta smallint not null default 0,
  child_0_4_delta smallint not null default 0,
  child_5_10_delta smallint not null default 0,
  idempotency_key text not null,
  notes text,
  reverses_checkin_id uuid references public.graduation_checkins (id),
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  constraint graduation_checkins_idempotency_key_unique unique (
    idempotency_key
  ),
  constraint graduation_checkins_graduate_delta_range check (
    graduate_delta between -1 and 1
  ),
  constraint graduation_checkins_adult_delta_range check (
    adult_guest_delta between -2 and 2
  ),
  constraint graduation_checkins_child_0_4_delta_range check (
    child_0_4_delta between -2 and 2
  ),
  constraint graduation_checkins_child_5_10_delta_range check (
    child_5_10_delta between -2 and 2
  ),
  constraint graduation_checkins_nonzero_delta check (
    graduate_delta <> 0
    or adult_guest_delta <> 0
    or child_0_4_delta <> 0
    or child_5_10_delta <> 0
  )
);

comment on table public.graduation_checkins is
  'Append-oriented check-in audit log. Rows record admissions, corrections and reversals and should not be updated after creation.';

create index graduation_checkins_registration_idx
  on public.graduation_checkins (registration_id);
create index graduation_checkins_ticket_idx
  on public.graduation_checkins (ticket_id);
create index graduation_checkins_staff_idx
  on public.graduation_checkins (staff_user_id);
create index graduation_checkins_created_at_idx
  on public.graduation_checkins (created_at);
create index graduation_checkins_idempotency_idx
  on public.graduation_checkins (idempotency_key);
create index graduation_checkins_is_test_idx
  on public.graduation_checkins (is_test);

-- Row Level Security.
-- RLS is enabled with no policies, so anon and authenticated roles cannot
-- read or write any row. Direct table privileges are also revoked below.
-- Server-side code must use the service role, which bypasses RLS.
-- Staff access policies will be added with authentication in CHECKIN-04.

alter table public.graduation_events enable row level security;
alter table public.graduation_registrations enable row level security;
alter table public.registration_guests enable row level security;
alter table public.graduation_tickets enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.graduation_checkins enable row level security;

revoke all on table public.graduation_events from anon, authenticated;
revoke all on table public.graduation_registrations from anon, authenticated;
revoke all on table public.registration_guests from anon, authenticated;
revoke all on table public.graduation_tickets from anon, authenticated;
revoke all on table public.staff_profiles from anon, authenticated;
revoke all on table public.graduation_checkins from anon, authenticated;
