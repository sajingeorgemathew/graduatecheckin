-- CHECKIN-03: Registration import pipeline.
-- Adds reviewed Excel import batches, normalized import rows, strict Row
-- Level Security and an atomic apply function that safely upserts approved
-- registrations without deleting anything and without touching tickets or
-- check-ins. Staff access policies arrive with authentication in CHECKIN-04.

-- Enum: import batch status

create type public.registration_import_status as enum (
  'uploaded',
  'preview_ready',
  'applying',
  'applied',
  'failed',
  'cancelled',
  'duplicate'
);

-- Enum: import row result

create type public.registration_import_row_result as enum (
  'new',
  'update',
  'unchanged',
  'warning',
  'error',
  'excluded',
  'applied'
);

-- Table: registration_imports

create table public.registration_imports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete cascade,
  original_filename text not null,
  file_sha256 text not null,
  file_size_bytes bigint not null,
  worksheet_name text not null,
  source_system public.registration_source not null
    default 'registration_export',
  status public.registration_import_status not null default 'uploaded',
  total_rows integer not null default 0,
  new_rows integer not null default 0,
  updated_rows integer not null default 0,
  unchanged_rows integer not null default 0,
  warning_rows integer not null default 0,
  error_rows integer not null default 0,
  excluded_rows integer not null default 0,
  missing_existing_rows integer not null default 0,
  created_by uuid references auth.users (id),
  applied_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint registration_imports_file_sha256_format check (
    file_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint registration_imports_file_size_positive check (
    file_size_bytes > 0
  ),
  constraint registration_imports_counts_not_negative check (
    total_rows >= 0
    and new_rows >= 0
    and updated_rows >= 0
    and unchanged_rows >= 0
    and warning_rows >= 0
    and error_rows >= 0
    and excluded_rows >= 0
    and missing_existing_rows >= 0
  )
);

comment on table public.registration_imports is
  'Reviewed registration workbook uploads. Each batch stores only the original filename, size and SHA-256 hash. Original workbook contents are never stored.';
comment on column public.registration_imports.file_sha256 is
  'SHA-256 hash of the uploaded workbook. The same applied file must not be applied twice to the same event.';
comment on column public.registration_imports.created_by is
  'Optional Auth user reference. Stays null until staff authentication is added in CHECKIN-04.';
comment on column public.registration_imports.applied_by is
  'Optional Auth user reference. Stays null until staff authentication is added in CHECKIN-04.';

-- The same file may only be applied once per event. Uploading a changed
-- workbook with a different hash remains allowed.
create unique index registration_imports_applied_file_unique
  on public.registration_imports (event_id, file_sha256)
  where status = 'applied';

create index registration_imports_event_idx
  on public.registration_imports (event_id);
create index registration_imports_status_idx
  on public.registration_imports (status);
create index registration_imports_file_sha256_idx
  on public.registration_imports (file_sha256);
create index registration_imports_created_at_idx
  on public.registration_imports (created_at);

create trigger registration_imports_set_updated_at
  before update on public.registration_imports
  for each row execute function public.set_updated_at();

-- Table: registration_import_rows

create table public.registration_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null
    references public.registration_imports (id) on delete cascade,
  source_row_number integer not null,
  source_registration_id text,
  graduate_full_name text,
  email text,
  phone text,
  gown_size text,
  name_pronunciation text,
  guest_1_name text,
  guest_2_name text,
  registered_adult_guests smallint not null default 0,
  registered_children_0_4 smallint not null default 0,
  registered_children_5_10 smallint not null default 0,
  expected_party_size smallint not null default 1,
  source_order_status text,
  registration_status public.registration_status not null
    default 'review_required',
  payment_status public.payment_status not null default 'unknown',
  fee_total numeric(10, 2),
  tax_total numeric(10, 2),
  order_total numeric(10, 2),
  source_order_date timestamptz,
  result public.registration_import_row_result not null default 'error',
  validation_errors jsonb not null default '[]'::jsonb,
  validation_warnings jsonb not null default '[]'::jsonb,
  existing_registration_id uuid
    references public.graduation_registrations (id) on delete set null,
  normalized_snapshot jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_import_rows_row_number_positive check (
    source_row_number > 0
  ),
  constraint registration_import_rows_row_unique unique (
    import_id, source_row_number
  ),
  constraint registration_import_rows_errors_is_array check (
    jsonb_typeof(validation_errors) = 'array'
  ),
  constraint registration_import_rows_warnings_is_array check (
    jsonb_typeof(validation_warnings) = 'array'
  )
);

comment on table public.registration_import_rows is
  'Normalized import rows containing whitelisted normalized values only. Unmapped spreadsheet cells and formulas are never stored. Rows missing from a newer upload never trigger automatic deletion.';
comment on column public.registration_import_rows.normalized_snapshot is
  'Whitelisted normalized import values plus the computed comparison action. Never raw spreadsheet cells and never formulas.';
comment on column public.registration_import_rows.existing_registration_id is
  'Matching registration found during preview. Applying an import preserves existing registration IDs.';

create index registration_import_rows_import_idx
  on public.registration_import_rows (import_id);
create index registration_import_rows_result_idx
  on public.registration_import_rows (result);
create index registration_import_rows_source_id_idx
  on public.registration_import_rows (source_registration_id);
create index registration_import_rows_existing_registration_idx
  on public.registration_import_rows (existing_registration_id);

create trigger registration_import_rows_set_updated_at
  before update on public.registration_import_rows
  for each row execute function public.set_updated_at();

-- Atomic apply function.
-- Upserts approved import rows into graduation_registrations while
-- preserving existing registration UUIDs, tickets and check-in history.
-- Missing registrations are never deleted and events are never touched.
-- No ticket and no check-in records are ever created here.

create or replace function public.apply_registration_import(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.registration_imports%rowtype;
  v_row public.registration_import_rows%rowtype;
  v_event_is_test boolean;
  v_existing_id uuid;
  v_applied_new integer := 0;
  v_applied_updated integer := 0;
  v_applied_unchanged integer := 0;
  v_skipped integer := 0;
begin
  select * into v_import
  from public.registration_imports
  where id = p_import_id
  for update;

  if not found then
    raise exception 'Import batch not found.';
  end if;

  if v_import.status <> 'preview_ready' then
    raise exception
      'Import batch is not ready to apply. Current status: %',
      v_import.status;
  end if;

  if exists (
    select 1
    from public.registration_imports other
    where other.event_id = v_import.event_id
      and other.file_sha256 = v_import.file_sha256
      and other.status = 'applied'
      and other.id <> v_import.id
  ) then
    update public.registration_imports
    set status = 'duplicate'
    where id = v_import.id;
    raise exception
      'An identical file has already been applied to this event.';
  end if;

  update public.registration_imports
  set status = 'applying'
  where id = v_import.id;

  select is_test into v_event_is_test
  from public.graduation_events
  where id = v_import.event_id;

  for v_row in
    select *
    from public.registration_import_rows
    where import_id = v_import.id
    order by source_row_number
  loop
    -- Rows with result error or excluded are never applied.
    if v_row.result not in ('new', 'update', 'unchanged', 'warning') then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select id into v_existing_id
    from public.graduation_registrations
    where event_id = v_import.event_id
      and source_system = v_import.source_system
      and source_registration_id = v_row.source_registration_id;

    if v_existing_id is null then
      insert into public.graduation_registrations (
        event_id,
        registration_code,
        source_system,
        source_registration_id,
        graduate_full_name,
        email,
        phone,
        gown_size,
        name_pronunciation,
        registered_adult_guests,
        registered_children_0_4,
        registered_children_5_10,
        registration_status,
        payment_status,
        fee_total,
        tax_total,
        order_total,
        source_order_date,
        is_test
      ) values (
        v_import.event_id,
        'REG-EXP-' || v_row.source_registration_id,
        v_import.source_system,
        v_row.source_registration_id,
        v_row.graduate_full_name,
        v_row.email,
        v_row.phone,
        v_row.gown_size,
        v_row.name_pronunciation,
        v_row.registered_adult_guests,
        v_row.registered_children_0_4,
        v_row.registered_children_5_10,
        v_row.registration_status,
        v_row.payment_status,
        v_row.fee_total,
        v_row.tax_total,
        v_row.order_total,
        v_row.source_order_date,
        coalesce(v_event_is_test, false)
      )
      returning id into v_existing_id;
      v_applied_new := v_applied_new + 1;
    else
      -- Existing registration UUID, registration code, tickets and
      -- check-in history are preserved. Only approved fields change.
      update public.graduation_registrations
      set graduate_full_name = v_row.graduate_full_name,
          email = v_row.email,
          phone = v_row.phone,
          gown_size = v_row.gown_size,
          name_pronunciation = v_row.name_pronunciation,
          registered_adult_guests = v_row.registered_adult_guests,
          registered_children_0_4 = v_row.registered_children_0_4,
          registered_children_5_10 = v_row.registered_children_5_10,
          registration_status = v_row.registration_status,
          payment_status = v_row.payment_status,
          fee_total = v_row.fee_total,
          tax_total = v_row.tax_total,
          order_total = v_row.order_total,
          source_order_date = v_row.source_order_date
      where id = v_existing_id;

      if v_row.result = 'update'
        or (
          v_row.result = 'warning'
          and (v_row.normalized_snapshot ->> 'comparison_action') = 'update'
        )
      then
        v_applied_updated := v_applied_updated + 1;
      else
        v_applied_unchanged := v_applied_unchanged + 1;
      end if;
    end if;

    -- Replace the optional adult guest-name rows with the approved
    -- imported values. Child guest detail rows are not managed by the
    -- import and are left untouched.
    delete from public.registration_guests
    where registration_id = v_existing_id
      and guest_category = 'adult';

    if v_row.guest_1_name is not null then
      insert into public.registration_guests (
        registration_id, guest_category, guest_name, sort_order, is_test
      ) values (
        v_existing_id, 'adult', v_row.guest_1_name, 1,
        coalesce(v_event_is_test, false)
      );
    end if;

    if v_row.guest_2_name is not null then
      insert into public.registration_guests (
        registration_id, guest_category, guest_name, sort_order, is_test
      ) values (
        v_existing_id, 'adult', v_row.guest_2_name, 2,
        coalesce(v_event_is_test, false)
      );
    end if;

    update public.registration_import_rows
    set applied_at = now(),
        existing_registration_id = v_existing_id
    where id = v_row.id;
  end loop;

  update public.registration_imports
  set status = 'applied',
      applied_at = now()
  where id = v_import.id;

  return jsonb_build_object(
    'applied_new', v_applied_new,
    'applied_updated', v_applied_updated,
    'applied_unchanged', v_applied_unchanged,
    'skipped', v_skipped
  );
end;
$$;

comment on function public.apply_registration_import(uuid) is
  'Atomically applies a preview_ready import batch. Upserts approved rows by event, source system and source registration ID, preserves registration UUIDs, never deletes registrations or events and never creates tickets or check-ins. Server-side trusted invocation only.';

-- Row Level Security.
-- RLS is enabled with no policies, so anon and authenticated roles cannot
-- read or write any row. Direct table privileges are also revoked below.
-- Only trusted server-side service-role code may read or write import
-- records. Staff policies will be added with authentication in CHECKIN-04.

alter table public.registration_imports enable row level security;
alter table public.registration_import_rows enable row level security;

revoke all on table public.registration_imports from anon, authenticated;
revoke all on table public.registration_import_rows from anon, authenticated;

revoke all on function public.apply_registration_import(uuid) from public;
revoke all on function public.apply_registration_import(uuid) from anon;
revoke all on function public.apply_registration_import(uuid)
  from authenticated;
