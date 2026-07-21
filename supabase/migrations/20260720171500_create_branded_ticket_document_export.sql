-- CHECKIN-09A: branded PDF admission ticket documents and export batches.
--
-- This migration is additive only. It never drops, deletes, renames or
-- alters previously deployed objects and never updates or deletes any
-- existing row. It does not touch graduation_tickets, graduation_checkins,
-- registration_guests or any CHECKIN-05 / CHECKIN-06 / CHECKIN-07 /
-- CHECKIN-08 object. The scanner protocol, QR payload format, ticket-token
-- format, ticket-validation logic, attendance logic, replacement logic and
-- revocation logic are all unchanged.
--
-- What this adds:
--   1. graduation_event_ticket_settings        per-event PDF presentation.
--   2. graduation_ticket_documents             immutable versioned PDFs.
--   3. graduation_ticket_document_batches      export batch headers.
--   4. graduation_ticket_document_batch_items  immutable batch snapshots.
--   5. finalize_graduation_ticket_document()   atomic version allocation.
--   6. invalidate_graduation_ticket_documents() replacement / revocation.
--   7. private storage bucket graduation-ticket-documents.
--
-- A ticket document is a rendered PDF of an existing secure ticket. It is
-- never a second admission credential: the QR inside the PDF carries the
-- existing CHECKIN-05 token for the existing graduation_tickets row. No raw
-- QR token and no token hash is ever stored, snapshotted or logged here.
--
-- Privacy: snapshots carry presentation data only (graduate display name,
-- ticket code, party counts and guest display names, event details). The
-- recipient email is stored on batch items alone, because CHECKIN-09B needs
-- the manifest for Google Apps Script distribution. Emails are never
-- exposed to scanner or public surfaces, and every table below is
-- deny-by-default with RLS enabled and no policies, matching the existing
-- service-role-only access convention.

-- ---------------------------------------------------------------------
-- 1. Enumerations
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'ticket_document_status'
  ) then
    create type public.ticket_document_status as enum (
      'current',
      'superseded',
      'invalidated'
    );
  end if;
end
$$;

-- Why a document stopped being usable. 'superseded' is recorded on the
-- document row only when a newer version replaced it; 'replaced' and
-- 'revoked' mirror the underlying graduation_tickets lifecycle so an
-- administrator preview can watermark the historical PDF correctly.
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'ticket_document_invalidation_reason'
  ) then
    create type public.ticket_document_invalidation_reason as enum (
      'superseded',
      'replaced',
      'revoked',
      'invalid'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'ticket_document_batch_status'
  ) then
    create type public.ticket_document_batch_status as enum (
      'draft',
      'generating',
      'ready',
      'partial',
      'failed',
      'exported',
      'cancelled'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'ticket_document_batch_purpose'
  ) then
    create type public.ticket_document_batch_purpose as enum (
      'initial',
      'updated',
      'replacement',
      'resend_preparation'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'ticket_document_batch_item_status'
  ) then
    create type public.ticket_document_batch_item_status as enum (
      'ready',
      'excluded',
      'failed'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 2. graduation_event_ticket_settings
-- ---------------------------------------------------------------------
--
-- One row per event drives the PDF presentation layer. The event row keeps
-- owning schedule-independent facts (code, mode, status, times, venue);
-- this table owns only what the printed ticket shows.

create table if not exists public.graduation_event_ticket_settings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete cascade,
  display_title text not null,
  description text not null,
  program_schedule jsonb not null default '[]'::jsonb,
  primary_logo_asset text not null,
  secondary_asset text,
  template_version integer not null default 1,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  constraint graduation_event_ticket_settings_event_unique unique (event_id),
  constraint graduation_event_ticket_settings_title_not_blank check (
    length(btrim(display_title)) > 0
  ),
  constraint graduation_event_ticket_settings_description_not_blank check (
    length(btrim(description)) > 0
  ),
  constraint graduation_event_ticket_settings_logo_not_blank check (
    length(btrim(primary_logo_asset)) > 0
  ),
  constraint graduation_event_ticket_settings_schedule_is_array check (
    jsonb_typeof(program_schedule) = 'array'
  ),
  constraint graduation_event_ticket_settings_template_version_positive check (
    template_version > 0
  )
);

comment on table public.graduation_event_ticket_settings is
  'Per-event presentation settings for the branded PDF admission ticket. Contains no credential material.';
comment on column public.graduation_event_ticket_settings.program_schedule is
  'Ordered JSON array of {start_time, end_time, title} entries shown on the printed ticket.';
comment on column public.graduation_event_ticket_settings.template_version is
  'Incremented when the PDF layout changes, so existing documents can be detected as stale.';

create index if not exists graduation_event_ticket_settings_event_idx
  on public.graduation_event_ticket_settings (event_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'graduation_event_ticket_settings_set_updated_at'
  ) then
    create trigger graduation_event_ticket_settings_set_updated_at
      before update on public.graduation_event_ticket_settings
      for each row execute function public.set_updated_at();
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 3. graduation_ticket_documents
-- ---------------------------------------------------------------------
--
-- Append-only history of rendered PDFs. A row is created only after its
-- bytes are already uploaded to private storage, so storage_path always
-- points at an object that existed at finalization time. Generated-file
-- metadata is immutable (see the guard trigger below); only lifecycle
-- columns may ever change.

create table if not exists public.graduation_ticket_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete cascade,
  registration_id uuid not null
    references public.graduation_registrations (id) on delete cascade,
  ticket_id uuid not null
    references public.graduation_tickets (id) on delete cascade,
  document_version integer not null,
  template_version integer not null,
  status public.ticket_document_status not null default 'current',
  storage_bucket text not null default 'graduation-ticket-documents',
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  file_size_bytes integer not null,
  sha256_checksum text not null,
  source_fingerprint text not null,
  graduate_name_snapshot text not null,
  ticket_code_snapshot text not null,
  registered_party_snapshot jsonb not null,
  event_snapshot jsonb not null,
  generated_by uuid references auth.users (id),
  generated_at timestamptz not null default now(),
  superseded_at timestamptz,
  invalidated_at timestamptz,
  invalidation_reason public.ticket_document_invalidation_reason,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint graduation_ticket_documents_version_unique unique (
    ticket_id, document_version
  ),
  constraint graduation_ticket_documents_path_unique unique (storage_path),
  constraint graduation_ticket_documents_version_positive check (
    document_version > 0
  ),
  constraint graduation_ticket_documents_template_version_positive check (
    template_version > 0
  ),
  constraint graduation_ticket_documents_size_positive check (
    file_size_bytes > 0
  ),
  constraint graduation_ticket_documents_mime_is_pdf check (
    mime_type = 'application/pdf'
  ),
  constraint graduation_ticket_documents_checksum_format check (
    sha256_checksum ~ '^[0-9a-f]{64}$'
  ),
  constraint graduation_ticket_documents_fingerprint_format check (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint graduation_ticket_documents_party_is_object check (
    jsonb_typeof(registered_party_snapshot) = 'object'
  ),
  constraint graduation_ticket_documents_event_is_object check (
    jsonb_typeof(event_snapshot) = 'object'
  ),
  -- Lifecycle timestamps must agree with the status.
  constraint graduation_ticket_documents_status_timestamps check (
    (status = 'current'
      and superseded_at is null
      and invalidated_at is null
      and invalidation_reason is null)
    or (status = 'superseded'
      and superseded_at is not null)
    or (status = 'invalidated'
      and invalidated_at is not null
      and invalidation_reason is not null)
  )
);

comment on table public.graduation_ticket_documents is
  'Append-only versioned history of branded PDF admission tickets. Never stores a raw QR token or token hash.';
comment on column public.graduation_ticket_documents.source_fingerprint is
  'Deterministic SHA-256 over every input that affects the rendered PDF. A mismatch means the document is stale.';
comment on column public.graduation_ticket_documents.storage_path is
  'Opaque private-storage object path built from IDs only. Never contains a graduate name or email address.';

-- Exactly one current document per ticket, enforced by the database rather
-- than by application code, so two concurrent generations can never both
-- land as current.
create unique index if not exists graduation_ticket_documents_one_current_per_ticket
  on public.graduation_ticket_documents (ticket_id)
  where status = 'current';

create index if not exists graduation_ticket_documents_event_idx
  on public.graduation_ticket_documents (event_id);
create index if not exists graduation_ticket_documents_registration_idx
  on public.graduation_ticket_documents (registration_id);
create index if not exists graduation_ticket_documents_ticket_idx
  on public.graduation_ticket_documents (ticket_id);
create index if not exists graduation_ticket_documents_status_idx
  on public.graduation_ticket_documents (status);
create index if not exists graduation_ticket_documents_event_status_idx
  on public.graduation_ticket_documents (event_id, status);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'graduation_ticket_documents_set_updated_at'
  ) then
    create trigger graduation_ticket_documents_set_updated_at
      before update on public.graduation_ticket_documents
      for each row execute function public.set_updated_at();
  end if;
end
$$;

-- Generated-file metadata is immutable once written. Only lifecycle
-- columns (status, superseded_at, invalidated_at, invalidation_reason,
-- updated_at) may ever be updated. This keeps the document history
-- trustworthy: a stored checksum always describes the stored bytes.
create or replace function public.guard_ticket_document_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.event_id is distinct from old.event_id
    or new.registration_id is distinct from old.registration_id
    or new.ticket_id is distinct from old.ticket_id
    or new.document_version is distinct from old.document_version
    or new.template_version is distinct from old.template_version
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path
    or new.file_name is distinct from old.file_name
    or new.mime_type is distinct from old.mime_type
    or new.file_size_bytes is distinct from old.file_size_bytes
    or new.sha256_checksum is distinct from old.sha256_checksum
    or new.source_fingerprint is distinct from old.source_fingerprint
    or new.graduate_name_snapshot is distinct from old.graduate_name_snapshot
    or new.ticket_code_snapshot is distinct from old.ticket_code_snapshot
    or new.registered_party_snapshot is distinct from old.registered_party_snapshot
    or new.event_snapshot is distinct from old.event_snapshot
    or new.generated_by is distinct from old.generated_by
    or new.generated_at is distinct from old.generated_at
    or new.created_at is distinct from old.created_at
  then
    raise exception
      'graduation_ticket_documents generated-file metadata is immutable'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'graduation_ticket_documents_guard_immutability'
  ) then
    create trigger graduation_ticket_documents_guard_immutability
      before update on public.graduation_ticket_documents
      for each row execute function public.guard_ticket_document_immutability();
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 4. graduation_ticket_document_batches
-- ---------------------------------------------------------------------

create table if not exists public.graduation_ticket_document_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.graduation_events (id) on delete cascade,
  batch_code text not null,
  status public.ticket_document_batch_status not null default 'draft',
  purpose public.ticket_document_batch_purpose not null default 'initial',
  selected_count integer not null default 0,
  ready_count integer not null default 0,
  failed_count integer not null default 0,
  excluded_count integer not null default 0,
  manifest_sha256 text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  exported_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint graduation_ticket_document_batches_code_unique unique (batch_code),
  constraint graduation_ticket_document_batches_code_format check (
    batch_code ~ '^[A-Z0-9-]{6,40}$'
  ),
  constraint graduation_ticket_document_batches_counts_not_negative check (
    selected_count >= 0
    and ready_count >= 0
    and failed_count >= 0
    and excluded_count >= 0
  ),
  -- Mirrors the CHECKIN-09A export ceiling so an oversized batch cannot be
  -- created even if an application check is bypassed.
  constraint graduation_ticket_document_batches_max_size check (
    selected_count <= 50
  ),
  constraint graduation_ticket_document_batches_manifest_format check (
    manifest_sha256 is null or manifest_sha256 ~ '^[0-9a-f]{64}$'
  )
);

comment on table public.graduation_ticket_document_batches is
  'Export batch headers. CHECKIN-09A prepares and packages batches; it never sends them.';
comment on column public.graduation_ticket_document_batches.purpose is
  'Why the batch was prepared. resend_preparation is consumed by the deferred CHECKIN-09B distribution work.';

create index if not exists graduation_ticket_document_batches_event_idx
  on public.graduation_ticket_document_batches (event_id);
create index if not exists graduation_ticket_document_batches_status_idx
  on public.graduation_ticket_document_batches (status);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'graduation_ticket_document_batches_set_updated_at'
  ) then
    create trigger graduation_ticket_document_batches_set_updated_at
      before update on public.graduation_ticket_document_batches
      for each row execute function public.set_updated_at();
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 5. graduation_ticket_document_batch_items
-- ---------------------------------------------------------------------
--
-- Each item is a frozen snapshot taken when the batch was created. Later
-- registration edits must never change a completed batch, so the manifest
-- an administrator downloads always matches the PDFs shipped with it.

create table if not exists public.graduation_ticket_document_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null
    references public.graduation_ticket_document_batches (id) on delete cascade,
  registration_id uuid not null
    references public.graduation_registrations (id) on delete cascade,
  ticket_id uuid
    references public.graduation_tickets (id) on delete set null,
  document_id uuid
    references public.graduation_ticket_documents (id) on delete set null,
  item_status public.ticket_document_batch_item_status not null default 'ready',
  exclusion_reason text,
  recipient_name_snapshot text not null,
  recipient_email_snapshot text,
  document_version_snapshot integer,
  pdf_file_name_snapshot text,
  pdf_sha256_snapshot text,
  party_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint graduation_ticket_document_batch_items_unique unique (
    batch_id, registration_id
  ),
  constraint graduation_ticket_document_batch_items_party_is_object check (
    jsonb_typeof(party_snapshot) = 'object'
  ),
  constraint graduation_ticket_document_batch_items_sha_format check (
    pdf_sha256_snapshot is null or pdf_sha256_snapshot ~ '^[0-9a-f]{64}$'
  ),
  -- A ready item must carry a complete document snapshot; a non-ready item
  -- must explain itself.
  constraint graduation_ticket_document_batch_items_ready_complete check (
    (item_status = 'ready'
      and document_id is not null
      and document_version_snapshot is not null
      and pdf_file_name_snapshot is not null
      and pdf_sha256_snapshot is not null)
    or (item_status <> 'ready'
      and exclusion_reason is not null)
  )
);

comment on table public.graduation_ticket_document_batch_items is
  'Immutable per-registration snapshot of an export batch. Recipient email is stored here only for the deferred CHECKIN-09B distribution step.';
comment on column public.graduation_ticket_document_batch_items.recipient_email_snapshot is
  'Administrator-only. Never exposed through scanner, supervisor or public APIs.';

create index if not exists graduation_ticket_document_batch_items_batch_idx
  on public.graduation_ticket_document_batch_items (batch_id);
create index if not exists graduation_ticket_document_batch_items_document_idx
  on public.graduation_ticket_document_batch_items (document_id);
create index if not exists graduation_ticket_document_batch_items_registration_idx
  on public.graduation_ticket_document_batch_items (registration_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'graduation_ticket_document_batch_items_set_updated_at'
  ) then
    create trigger graduation_ticket_document_batch_items_set_updated_at
      before update on public.graduation_ticket_document_batch_items
      for each row execute function public.set_updated_at();
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 6. Atomic document finalization
-- ---------------------------------------------------------------------
--
-- Supabase Storage and Postgres do not share a transaction, so the caller
-- uploads the PDF to a unique object path first and finalizes here. This
-- function is the only supported way to create a current document.
--
-- Concurrency: the ticket row is locked with FOR UPDATE before the next
-- version is chosen, so two simultaneous generations serialize. The second
-- caller observes the first caller's document and allocates version n+1.
-- The partial unique index is the final backstop.

create or replace function public.finalize_graduation_ticket_document(
  p_actor_user_id uuid,
  p_ticket_id uuid,
  p_document_id uuid,
  p_template_version integer,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text,
  p_file_size_bytes integer,
  p_sha256_checksum text,
  p_source_fingerprint text,
  p_graduate_name_snapshot text,
  p_ticket_code_snapshot text,
  p_registered_party_snapshot jsonb,
  p_event_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_ticket record;
  v_next_version integer;
  v_document record;
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

  -- Lock the ticket so version allocation is serialized per ticket.
  select id, registration_id, ticket_code, status
    into v_ticket
  from public.graduation_tickets
  where id = p_ticket_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'ticket_not_found');
  end if;

  -- Only an active ticket may receive a new current document. A replaced
  -- or revoked ticket keeps its history but never gains a new PDF.
  if v_ticket.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'ticket_not_active');
  end if;

  select coalesce(max(document_version), 0) + 1
    into v_next_version
  from public.graduation_ticket_documents
  where ticket_id = p_ticket_id;

  -- Supersede the previous current document, if any.
  update public.graduation_ticket_documents
  set status = 'superseded',
      superseded_at = now()
  where ticket_id = p_ticket_id
    and status = 'current';

  insert into public.graduation_ticket_documents (
    id,
    event_id,
    registration_id,
    ticket_id,
    document_version,
    template_version,
    status,
    storage_bucket,
    storage_path,
    file_name,
    file_size_bytes,
    sha256_checksum,
    source_fingerprint,
    graduate_name_snapshot,
    ticket_code_snapshot,
    registered_party_snapshot,
    event_snapshot,
    generated_by
  )
  select
    coalesce(p_document_id, gen_random_uuid()),
    r.event_id,
    v_ticket.registration_id,
    p_ticket_id,
    v_next_version,
    p_template_version,
    'current',
    p_storage_bucket,
    p_storage_path,
    p_file_name,
    p_file_size_bytes,
    p_sha256_checksum,
    p_source_fingerprint,
    p_graduate_name_snapshot,
    p_ticket_code_snapshot,
    p_registered_party_snapshot,
    p_event_snapshot,
    p_actor_user_id
  from public.graduation_registrations r
  where r.id = v_ticket.registration_id
  returning * into v_document;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'registration_not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'document_id', v_document.id,
    'document_version', v_document.document_version,
    'status', v_document.status,
    'generated_at', v_document.generated_at
  );
end;
$$;

revoke all on function public.finalize_graduation_ticket_document(
  uuid, uuid, uuid, integer, text, text, text, integer, text, text, text,
  text, jsonb, jsonb
) from public;
revoke all on function public.finalize_graduation_ticket_document(
  uuid, uuid, uuid, integer, text, text, text, integer, text, text, text,
  text, jsonb, jsonb
) from anon;
revoke all on function public.finalize_graduation_ticket_document(
  uuid, uuid, uuid, integer, text, text, text, integer, text, text, text,
  text, jsonb, jsonb
) from authenticated;

-- ---------------------------------------------------------------------
-- 7. Invalidation on ticket replacement and revocation
-- ---------------------------------------------------------------------
--
-- Called after the existing CHECKIN-05 replacement or revocation function
-- has already changed the ticket. This only marks documents; it never
-- touches graduation_tickets, graduation_checkins or attendance totals.

create or replace function public.invalidate_graduation_ticket_documents(
  p_actor_user_id uuid,
  p_ticket_id uuid,
  p_reason public.ticket_document_invalidation_reason
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_count integer;
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

  if p_reason = 'superseded' then
    -- Superseding is owned by finalize_graduation_ticket_document.
    return jsonb_build_object('ok', false, 'code', 'invalid_reason');
  end if;

  update public.graduation_ticket_documents
  set status = 'invalidated',
      invalidated_at = now(),
      invalidation_reason = p_reason
  where ticket_id = p_ticket_id
    and status <> 'invalidated';

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'invalidated_count', v_count
  );
end;
$$;

revoke all on function public.invalidate_graduation_ticket_documents(
  uuid, uuid, public.ticket_document_invalidation_reason
) from public;
revoke all on function public.invalidate_graduation_ticket_documents(
  uuid, uuid, public.ticket_document_invalidation_reason
) from anon;
revoke all on function public.invalidate_graduation_ticket_documents(
  uuid, uuid, public.ticket_document_invalidation_reason
) from authenticated;

-- ---------------------------------------------------------------------
-- 8. Row level security
-- ---------------------------------------------------------------------
--
-- Matching the existing convention: RLS is enabled and no policy is
-- created, so every table is deny-by-default for anon and authenticated
-- roles. All access goes through the server-only service-role client.

alter table public.graduation_event_ticket_settings enable row level security;
alter table public.graduation_ticket_documents enable row level security;
alter table public.graduation_ticket_document_batches enable row level security;
alter table public.graduation_ticket_document_batch_items enable row level security;

revoke all on table public.graduation_event_ticket_settings from anon, authenticated;
revoke all on table public.graduation_ticket_documents from anon, authenticated;
revoke all on table public.graduation_ticket_document_batches from anon, authenticated;
revoke all on table public.graduation_ticket_document_batch_items from anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. Private storage bucket
-- ---------------------------------------------------------------------
--
-- Private, PDF only, 10 MB ceiling. Object paths are opaque and built from
-- IDs alone. No storage policy is created, so anon and authenticated roles
-- cannot read or write objects; downloads are served by an authenticated
-- administrator route or a short-lived signed URL created server-side.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'graduation-ticket-documents',
  'graduation-ticket-documents',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf'];
