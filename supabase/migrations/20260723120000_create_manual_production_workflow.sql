-- CHECKIN-10B: emergency manual production release.
--
-- Additive only. Nothing in this migration alters, drops or rewrites an
-- object created by an earlier deployed migration. The Google Apps Script
-- distribution tables from CHECKIN-09B and CHECKIN-09C are left completely
-- untouched: their rows remain readable historical audit and the feature is
-- retired from the administrator workflow in application code only.
--
-- This migration adds:
--   1. a production RSVP import pipeline that reconciles repeated rows into
--      one graduate registration while preserving every source order ID,
--   2. a permanent registration-to-source-order link table so a supplemental
--      guest-payment order stays traceable after the import record ages out,
--   3. an append-only manual delivery ledger recording sends the
--      administrator performed by hand in Gmail,
--   4. a roster-candidate table for the later full graduate roster.
--
-- No table here is ever readable by anon or authenticated: RLS is enabled
-- with no policies and direct privileges are revoked, matching every
-- existing table in this schema. Only trusted server-side service-role code
-- reads or writes these rows.

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'production_import_status' and n.nspname = 'public'
  ) then
    create type public.production_import_status as enum (
      'uploaded',
      'preview_ready',
      'applying',
      'applied',
      'cancelled',
      'failed',
      'duplicate'
    );
  end if;
end;
$$;

-- The role a single workbook row plays inside its graduate group.
--   primary              the graduate's main RSVP order
--   supplemental         a further guest-payment or guest-update order that
--                        must be preserved and merged, never discarded
--   duplicate_submission a repeated zero-guest, zero-payment RSVP row that
--                        the administrator may consolidate
--   excluded             an administrator excluded the row
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'production_import_order_role' and n.nspname = 'public'
  ) then
    create type public.production_import_order_role as enum (
      'primary',
      'supplemental',
      'duplicate_submission',
      'excluded'
    );
  end if;
end;
$$;

-- A reconciled graduate group always starts as needs_review when the
-- reconciler could not decide safely. Only an approved group is applied.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'production_import_group_decision' and n.nspname = 'public'
  ) then
    create type public.production_import_group_decision as enum (
      'needs_review',
      'approved',
      'excluded'
    );
  end if;
end;
$$;

-- Manual delivery is always performed by a human in Gmail. The application
-- never sends mail, so there is no failure outcome recorded by a provider:
-- an administrator records only what they actually did.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'manual_delivery_kind' and n.nspname = 'public'
  ) then
    create type public.manual_delivery_kind as enum (
      'initial',
      'resend',
      'replacement'
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Table: production_registration_imports
-- ---------------------------------------------------------------------

create table if not exists public.production_registration_imports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete restrict,
  original_filename text not null,
  file_sha256 text not null,
  file_size_bytes integer not null,
  worksheet_name text not null,
  status public.production_import_status not null default 'uploaded',
  source_order_count integer not null default 0,
  graduate_count integer not null default 0,
  duplicate_submission_count integer not null default 0,
  supplemental_order_count integer not null default 0,
  needs_review_count integer not null default 0,
  excluded_count integer not null default 0,
  expected_ticket_count integer not null default 0,
  notices jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  applied_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint production_registration_imports_checksum_format check (
    file_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint production_registration_imports_size_positive check (
    file_size_bytes > 0
  ),
  constraint production_registration_imports_notices_is_array check (
    jsonb_typeof(notices) = 'array'
  )
);

comment on table public.production_registration_imports is
  'Header record for one RSVP workbook uploaded to the direct production import. The original workbook is parsed in memory and is never stored here, in storage or in version control.';

create index if not exists production_registration_imports_event_idx
  on public.production_registration_imports (event_id);
create index if not exists production_registration_imports_status_idx
  on public.production_registration_imports (status);
create index if not exists production_registration_imports_created_at_idx
  on public.production_registration_imports (created_at desc);

drop trigger if exists production_registration_imports_set_updated_at
  on public.production_registration_imports;
create trigger production_registration_imports_set_updated_at
  before update on public.production_registration_imports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Table: production_import_graduates
--
-- One reconciled graduate per row. Several workbook rows may collapse into
-- one of these; the approved counts here are what a production registration
-- receives, so a repeated guest name or a repeated child count can never
-- silently inflate a party.
-- ---------------------------------------------------------------------

create table if not exists public.production_import_graduates (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null
    references public.production_registration_imports (id) on delete cascade,
  group_key text not null,
  canonical_full_name text not null,
  email text,
  phone text,
  gown_size text,
  name_pronunciation text,
  approved_adult_guests smallint not null default 0,
  approved_children_0_4 smallint not null default 0,
  approved_children_5_10 smallint not null default 0,
  approved_adult_guest_names jsonb not null default '[]'::jsonb,
  fee_total numeric(10, 2) not null default 0,
  tax_total numeric(10, 2) not null default 0,
  order_total numeric(10, 2) not null default 0,
  decision public.production_import_group_decision not null
    default 'needs_review',
  review_reasons jsonb not null default '[]'::jsonb,
  reconciliation_note text,
  primary_source_order_id text not null,
  existing_registration_id uuid
    references public.graduation_registrations (id) on delete set null,
  applied_registration_id uuid
    references public.graduation_registrations (id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_import_graduates_group_unique unique (
    import_id, group_key
  ),
  constraint production_import_graduates_adults_range check (
    approved_adult_guests between 0 and 2
  ),
  constraint production_import_graduates_children_0_4_range check (
    approved_children_0_4 between 0 and 2
  ),
  constraint production_import_graduates_children_5_10_range check (
    approved_children_5_10 between 0 and 2
  ),
  constraint production_import_graduates_children_combined check (
    approved_children_0_4 + approved_children_5_10 <= 2
  ),
  constraint production_import_graduates_guest_names_is_array check (
    jsonb_typeof(approved_adult_guest_names) = 'array'
  ),
  constraint production_import_graduates_review_reasons_is_array check (
    jsonb_typeof(review_reasons) = 'array'
  )
);

comment on table public.production_import_graduates is
  'One reconciled graduate per row. Applying an import creates at most one production registration and therefore at most one ticket per row here.';
comment on column public.production_import_graduates.approved_adult_guests is
  'Adult guests the administrator approved. An adult guest requires a matching paid guest transaction or an explicit administrator approval recorded in reconciliation_note.';

create index if not exists production_import_graduates_import_idx
  on public.production_import_graduates (import_id);
create index if not exists production_import_graduates_decision_idx
  on public.production_import_graduates (decision);
create index if not exists production_import_graduates_existing_idx
  on public.production_import_graduates (existing_registration_id);

drop trigger if exists production_import_graduates_set_updated_at
  on public.production_import_graduates;
create trigger production_import_graduates_set_updated_at
  before update on public.production_import_graduates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Table: production_import_source_orders
--
-- Every workbook row is preserved verbatim-after-normalization, including
-- rows the administrator excludes, so the audit trail always answers "which
-- order paid for this guest".
-- ---------------------------------------------------------------------

create table if not exists public.production_import_source_orders (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null
    references public.production_registration_imports (id) on delete cascade,
  graduate_id uuid
    references public.production_import_graduates (id) on delete cascade,
  source_row_number integer not null,
  source_order_id text not null,
  order_role public.production_import_order_role not null default 'primary',
  graduate_full_name text,
  email text,
  phone text,
  gown_size text,
  name_pronunciation text,
  guest_1_name text,
  guest_2_name text,
  kids_0_4 smallint not null default 0,
  kids_5_10 smallint not null default 0,
  fee_total numeric(10, 2),
  tax_total numeric(10, 2),
  order_total numeric(10, 2),
  source_note text,
  source_order_status text,
  source_order_date timestamptz,
  registration_status public.registration_status not null
    default 'review_required',
  payment_status public.payment_status not null default 'unknown',
  validation_errors jsonb not null default '[]'::jsonb,
  validation_warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_import_source_orders_row_positive check (
    source_row_number > 0
  ),
  constraint production_import_source_orders_row_unique unique (
    import_id, source_row_number
  ),
  constraint production_import_source_orders_errors_is_array check (
    jsonb_typeof(validation_errors) = 'array'
  ),
  constraint production_import_source_orders_warnings_is_array check (
    jsonb_typeof(validation_warnings) = 'array'
  )
);

comment on table public.production_import_source_orders is
  'One row per uploaded workbook row. A supplemental guest-payment order is preserved here and merged into its graduate; it is never discarded as a duplicate and never creates a second registration.';

create index if not exists production_import_source_orders_import_idx
  on public.production_import_source_orders (import_id);
create index if not exists production_import_source_orders_graduate_idx
  on public.production_import_source_orders (graduate_id);
create index if not exists production_import_source_orders_order_idx
  on public.production_import_source_orders (source_order_id);

drop trigger if exists production_import_source_orders_set_updated_at
  on public.production_import_source_orders;
create trigger production_import_source_orders_set_updated_at
  before update on public.production_import_source_orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Table: registration_source_orders
--
-- The permanent link between one production registration and every RSVP or
-- supplemental guest order that contributed to it. Unique per event and
-- order ID, which is what makes re-importing the same workbook idempotent.
-- ---------------------------------------------------------------------

create table if not exists public.registration_source_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete restrict,
  registration_id uuid not null
    references public.graduation_registrations (id) on delete cascade,
  source_order_id text not null,
  order_role public.production_import_order_role not null default 'primary',
  source_row_number integer,
  import_id uuid
    references public.production_registration_imports (id) on delete set null,
  fee_total numeric(10, 2),
  tax_total numeric(10, 2),
  order_total numeric(10, 2),
  source_order_date timestamptz,
  source_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_source_orders_event_order_unique unique (
    event_id, source_order_id
  )
);

comment on table public.registration_source_orders is
  'Permanent audit link from a production registration to every source order ID that contributed to it, including supplemental guest-payment orders. The unique (event_id, source_order_id) key makes a repeated import idempotent.';

create index if not exists registration_source_orders_registration_idx
  on public.registration_source_orders (registration_id);
create index if not exists registration_source_orders_import_idx
  on public.registration_source_orders (import_id);

drop trigger if exists registration_source_orders_set_updated_at
  on public.registration_source_orders;
create trigger registration_source_orders_set_updated_at
  before update on public.registration_source_orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Table: graduation_manual_ticket_sends
--
-- Append-only ledger of sends an administrator performed by hand in Gmail.
-- The application never writes a row here on its own: a row exists only
-- because an administrator confirmed they had already sent the message.
-- ---------------------------------------------------------------------

create table if not exists public.graduation_manual_ticket_sends (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete restrict,
  registration_id uuid not null
    references public.graduation_registrations (id) on delete restrict,
  ticket_id uuid
    references public.graduation_tickets (id) on delete restrict,
  document_id uuid
    references public.graduation_ticket_documents (id) on delete restrict,
  attempt_number integer not null,
  send_kind public.manual_delivery_kind not null default 'initial',
  idempotency_key text not null,
  intended_recipient_snapshot text not null,
  actual_recipient_snapshot text,
  mode public.ticket_delivery_mode not null default 'production',
  provider text not null default 'manual-gmail',
  outcome text not null default 'sent',
  ticket_code_snapshot text not null,
  pdf_file_name_snapshot text,
  document_version_snapshot integer,
  party_snapshot jsonb not null default '{}'::jsonb,
  reason text,
  note text,
  gmail_message_id text,
  sent_at timestamptz not null default now(),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint graduation_manual_ticket_sends_idempotency_unique unique (
    idempotency_key
  ),
  constraint graduation_manual_ticket_sends_attempt_positive check (
    attempt_number > 0
  ),
  constraint graduation_manual_ticket_sends_outcome_sent check (
    outcome = 'sent'
  ),
  constraint graduation_manual_ticket_sends_provider_manual check (
    provider = 'manual-gmail'
  ),
  constraint graduation_manual_ticket_sends_reason_required check (
    send_kind = 'initial' or (reason is not null and length(btrim(reason)) >= 5)
  )
);

comment on table public.graduation_manual_ticket_sends is
  'Append-only record of a ticket email an administrator sent by hand through Gmail. The application never sends email; a row here means a human confirmed a send already happened. Updates and deletes are blocked by a trigger.';
comment on column public.graduation_manual_ticket_sends.idempotency_key is
  'Client-supplied key preventing an accidental double-click from recording two attempts for the same send.';

create index if not exists graduation_manual_ticket_sends_registration_idx
  on public.graduation_manual_ticket_sends (registration_id);
create index if not exists graduation_manual_ticket_sends_ticket_idx
  on public.graduation_manual_ticket_sends (ticket_id);
create index if not exists graduation_manual_ticket_sends_event_idx
  on public.graduation_manual_ticket_sends (event_id);
create index if not exists graduation_manual_ticket_sends_sent_at_idx
  on public.graduation_manual_ticket_sends (sent_at desc);

create or replace function public.guard_manual_ticket_send_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception
    'graduation_manual_ticket_sends is append-only. Record a new attempt instead.';
  return null;
end;
$$;

comment on function public.guard_manual_ticket_send_append_only() is
  'Blocks updates and deletes so the manual delivery ledger stays append-only.';

drop trigger if exists graduation_manual_ticket_sends_append_only
  on public.graduation_manual_ticket_sends;
create trigger graduation_manual_ticket_sends_append_only
  before update or delete on public.graduation_manual_ticket_sends
  for each row execute function public.guard_manual_ticket_send_append_only();

-- ---------------------------------------------------------------------
-- Table: graduate_roster_candidates
--
-- The later full roster of 180-190 graduates. Deliberately separate from
-- graduation_registrations: a roster candidate is not an event registration
-- and never receives a ticket until an administrator creates a production
-- registration from it.
-- ---------------------------------------------------------------------

create table if not exists public.graduate_roster_candidates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete restrict,
  student_id text,
  full_name text not null,
  email text,
  phone text,
  program text,
  batch text,
  registration_id uuid
    references public.graduation_registrations (id) on delete set null,
  internal_notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.graduate_roster_candidates is
  'Full graduate roster kept separate from event registrations. A candidate becomes a registration only through an explicit administrator action.';

create unique index if not exists graduate_roster_candidates_student_unique
  on public.graduate_roster_candidates (event_id, student_id)
  where student_id is not null;
create index if not exists graduate_roster_candidates_event_idx
  on public.graduate_roster_candidates (event_id);
create index if not exists graduate_roster_candidates_name_idx
  on public.graduate_roster_candidates (lower(full_name));

drop trigger if exists graduate_roster_candidates_set_updated_at
  on public.graduate_roster_candidates;
create trigger graduate_roster_candidates_set_updated_at
  before update on public.graduate_roster_candidates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Function: apply_production_registration_import
--
-- Applies one reviewed production import atomically.
--
--  - Only groups with decision 'approved' are applied.
--  - A group matches an existing registration through any of its linked
--    source order IDs, so a second workbook containing only the
--    supplemental order still updates the same graduate.
--  - Existing registration UUIDs, registration codes, tickets, documents
--    and check-in history are preserved. Nothing is ever deleted.
--  - No ticket and no check-in record is ever created here.
--  - Re-running with the same order IDs updates in place and inserts no
--    duplicate registration, guest, source-order link or payment.
-- ---------------------------------------------------------------------

create or replace function public.apply_production_registration_import(
  p_import_id uuid,
  p_applied_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.production_registration_imports%rowtype;
  v_group public.production_import_graduates%rowtype;
  v_order public.production_import_source_orders%rowtype;
  v_event_is_test boolean;
  v_registration_id uuid;
  v_guest_name text;
  v_sort integer;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_orders_linked integer := 0;
begin
  select * into v_import
  from public.production_registration_imports
  where id = p_import_id
  for update;

  if not found then
    raise exception 'Production import not found.';
  end if;

  if v_import.status <> 'preview_ready' then
    raise exception
      'Production import is not ready to apply. Current status: %',
      v_import.status;
  end if;

  update public.production_registration_imports
  set status = 'applying'
  where id = v_import.id;

  select is_test into v_event_is_test
  from public.graduation_events
  where id = v_import.event_id;

  for v_group in
    select *
    from public.production_import_graduates
    where import_id = v_import.id
    order by canonical_full_name, group_key
  loop
    if v_group.decision <> 'approved' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Match through any linked source order first: a follow-up workbook may
    -- carry only the supplemental guest order for an already-imported
    -- graduate, and that must still resolve to the same registration.
    select link.registration_id into v_registration_id
    from public.registration_source_orders link
    join public.production_import_source_orders src
      on src.source_order_id = link.source_order_id
    where link.event_id = v_import.event_id
      and src.graduate_id = v_group.id
    limit 1;

    if v_registration_id is null then
      select id into v_registration_id
      from public.graduation_registrations
      where event_id = v_import.event_id
        and source_system = 'registration_export'
        and source_registration_id = v_group.primary_source_order_id;
    end if;

    if v_registration_id is null then
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
        internal_notes,
        is_test
      ) values (
        v_import.event_id,
        'REG-EXP-' || v_group.primary_source_order_id,
        'registration_export',
        v_group.primary_source_order_id,
        v_group.canonical_full_name,
        v_group.email,
        v_group.phone,
        v_group.gown_size,
        v_group.name_pronunciation,
        v_group.approved_adult_guests,
        v_group.approved_children_0_4,
        v_group.approved_children_5_10,
        'eligible',
        case when v_group.order_total > 0 then 'amount_recorded'
             else 'unknown' end,
        v_group.fee_total,
        v_group.tax_total,
        v_group.order_total,
        v_group.reconciliation_note,
        coalesce(v_event_is_test, false)
      )
      returning id into v_registration_id;
      v_created := v_created + 1;
    else
      update public.graduation_registrations
      set graduate_full_name = v_group.canonical_full_name,
          email = v_group.email,
          phone = v_group.phone,
          gown_size = v_group.gown_size,
          name_pronunciation = v_group.name_pronunciation,
          registered_adult_guests = v_group.approved_adult_guests,
          registered_children_0_4 = v_group.approved_children_0_4,
          registered_children_5_10 = v_group.approved_children_5_10,
          registration_status = 'eligible',
          payment_status = case when v_group.order_total > 0
                                then 'amount_recorded' else 'unknown' end,
          fee_total = v_group.fee_total,
          tax_total = v_group.tax_total,
          order_total = v_group.order_total,
          internal_notes = coalesce(
            v_group.reconciliation_note, internal_notes
          )
      where id = v_registration_id;
      v_updated := v_updated + 1;
    end if;

    -- Replace the adult guest-name rows with the approved reconciled set.
    -- Child detail rows are counted, never named, and are left untouched.
    delete from public.registration_guests
    where registration_id = v_registration_id
      and guest_category = 'adult';

    v_sort := 0;
    for v_guest_name in
      select value
      from jsonb_array_elements_text(v_group.approved_adult_guest_names)
    loop
      v_sort := v_sort + 1;
      exit when v_sort > v_group.approved_adult_guests;
      insert into public.registration_guests (
        registration_id, guest_category, guest_name, sort_order, is_test
      ) values (
        v_registration_id, 'adult', v_guest_name, v_sort,
        coalesce(v_event_is_test, false)
      );
    end loop;

    -- Link every contributing source order, including supplemental guest
    -- orders. The unique (event_id, source_order_id) key makes a repeated
    -- import update the existing link instead of inserting a second one.
    for v_order in
      select *
      from public.production_import_source_orders
      where graduate_id = v_group.id
      order by source_row_number
    loop
      insert into public.registration_source_orders (
        event_id,
        registration_id,
        source_order_id,
        order_role,
        source_row_number,
        import_id,
        fee_total,
        tax_total,
        order_total,
        source_order_date,
        source_note
      ) values (
        v_import.event_id,
        v_registration_id,
        v_order.source_order_id,
        v_order.order_role,
        v_order.source_row_number,
        v_import.id,
        v_order.fee_total,
        v_order.tax_total,
        v_order.order_total,
        v_order.source_order_date,
        v_order.source_note
      )
      on conflict (event_id, source_order_id) do update
      set registration_id = excluded.registration_id,
          order_role = excluded.order_role,
          source_row_number = excluded.source_row_number,
          import_id = excluded.import_id,
          fee_total = excluded.fee_total,
          tax_total = excluded.tax_total,
          order_total = excluded.order_total,
          source_order_date = excluded.source_order_date,
          source_note = excluded.source_note;
      v_orders_linked := v_orders_linked + 1;
    end loop;

    update public.production_import_graduates
    set applied_registration_id = v_registration_id,
        existing_registration_id = v_registration_id,
        applied_at = now()
    where id = v_group.id;
  end loop;

  update public.production_registration_imports
  set status = 'applied',
      applied_at = now(),
      applied_by = p_applied_by
  where id = v_import.id;

  return jsonb_build_object(
    'created_registrations', v_created,
    'updated_registrations', v_updated,
    'skipped_groups', v_skipped,
    'linked_source_orders', v_orders_linked
  );
end;
$$;

comment on function public.apply_production_registration_import(uuid, uuid) is
  'Atomically applies a reviewed production RSVP import. Creates at most one registration per reconciled graduate, preserves every source order ID including supplemental guest orders, never deletes a registration and never creates a ticket or a check-in.';

-- ---------------------------------------------------------------------
-- Function: record_manual_ticket_send
--
-- Records one append-only manual delivery attempt. Returns the existing
-- attempt unchanged when the idempotency key was already used, so an
-- accidental double-click can never produce two attempts.
-- ---------------------------------------------------------------------

create or replace function public.record_manual_ticket_send(
  p_registration_id uuid,
  p_ticket_id uuid,
  p_document_id uuid,
  p_send_kind public.manual_delivery_kind,
  p_idempotency_key text,
  p_intended_recipient text,
  p_actual_recipient text,
  p_reason text,
  p_note text,
  p_gmail_message_id text,
  p_recorded_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.graduation_registrations%rowtype;
  v_ticket public.graduation_tickets%rowtype;
  v_document public.graduation_ticket_documents%rowtype;
  v_existing public.graduation_manual_ticket_sends%rowtype;
  v_attempt_number integer;
  v_new_id uuid;
  -- Held separately so a send recorded without a PDF never reads a field
  -- of an unassigned record.
  v_pdf_file_name text := null;
  v_document_version integer := null;
begin
  select * into v_existing
  from public.graduation_manual_ticket_sends
  where idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'attempt_id', v_existing.id,
      'attempt_number', v_existing.attempt_number,
      'duplicate', true
    );
  end if;

  select * into v_registration
  from public.graduation_registrations
  where id = p_registration_id
  for update;

  if not found then
    raise exception 'Registration not found.';
  end if;

  select * into v_ticket
  from public.graduation_tickets
  where id = p_ticket_id;

  if not found then
    raise exception 'Ticket not found.';
  end if;

  if v_ticket.registration_id <> p_registration_id then
    raise exception 'The ticket does not belong to this registration.';
  end if;

  if v_ticket.status <> 'active' then
    raise exception 'Only an active ticket can be recorded as sent.';
  end if;

  if p_document_id is not null then
    select * into v_document
    from public.graduation_ticket_documents
    where id = p_document_id;

    if not found or v_document.ticket_id <> p_ticket_id then
      raise exception 'The PDF does not belong to this ticket.';
    end if;

    v_pdf_file_name := v_document.file_name;
    v_document_version := v_document.document_version;
  end if;

  select coalesce(max(attempt_number), 0) + 1 into v_attempt_number
  from public.graduation_manual_ticket_sends
  where registration_id = p_registration_id;

  insert into public.graduation_manual_ticket_sends (
    event_id,
    registration_id,
    ticket_id,
    document_id,
    attempt_number,
    send_kind,
    idempotency_key,
    intended_recipient_snapshot,
    actual_recipient_snapshot,
    mode,
    provider,
    outcome,
    ticket_code_snapshot,
    pdf_file_name_snapshot,
    document_version_snapshot,
    party_snapshot,
    reason,
    note,
    gmail_message_id,
    recorded_by
  ) values (
    v_registration.event_id,
    p_registration_id,
    p_ticket_id,
    p_document_id,
    v_attempt_number,
    p_send_kind,
    p_idempotency_key,
    p_intended_recipient,
    p_actual_recipient,
    'production',
    'manual-gmail',
    'sent',
    v_ticket.ticket_code,
    v_pdf_file_name,
    v_document_version,
    jsonb_build_object(
      'graduate_count', 1,
      'adult_guest_count', v_registration.registered_adult_guests,
      'child_0_4_count', v_registration.registered_children_0_4,
      'child_5_10_count', v_registration.registered_children_5_10,
      'total_party_count', v_registration.expected_party_size
    ),
    p_reason,
    p_note,
    p_gmail_message_id,
    p_recorded_by
  )
  returning id into v_new_id;

  -- The ticket keeps its first send timestamp; a resend never rewrites it.
  update public.graduation_tickets
  set sent_at = coalesce(sent_at, now())
  where id = p_ticket_id;

  return jsonb_build_object(
    'attempt_id', v_new_id,
    'attempt_number', v_attempt_number,
    'duplicate', false
  );
end;
$$;

comment on function public.record_manual_ticket_send(uuid, uuid, uuid, public.manual_delivery_kind, text, text, text, text, text, text, uuid) is
  'Records one append-only manual Gmail send an administrator already performed. Idempotent on the supplied key so a double-click records one attempt. Sends no email and never invalidates a ticket.';

-- ---------------------------------------------------------------------
-- Row Level Security.
-- Enabled with no policies, so anon and authenticated cannot read or write
-- any row. Direct table and function privileges are revoked as well. Only
-- trusted server-side service-role code touches these tables.
-- ---------------------------------------------------------------------

alter table public.production_registration_imports enable row level security;
alter table public.production_import_graduates enable row level security;
alter table public.production_import_source_orders enable row level security;
alter table public.registration_source_orders enable row level security;
alter table public.graduation_manual_ticket_sends enable row level security;
alter table public.graduate_roster_candidates enable row level security;

revoke all on table public.production_registration_imports
  from anon, authenticated;
revoke all on table public.production_import_graduates
  from anon, authenticated;
revoke all on table public.production_import_source_orders
  from anon, authenticated;
revoke all on table public.registration_source_orders
  from anon, authenticated;
revoke all on table public.graduation_manual_ticket_sends
  from anon, authenticated;
revoke all on table public.graduate_roster_candidates
  from anon, authenticated;

revoke all on function public.apply_production_registration_import(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.record_manual_ticket_send(
  uuid, uuid, uuid, public.manual_delivery_kind, text, text, text, text,
  text, text, uuid
) from public, anon, authenticated;
revoke all on function public.guard_manual_ticket_send_append_only()
  from public, anon, authenticated;
