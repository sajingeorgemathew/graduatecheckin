-- CHECKIN-10B hotfix: enum casting in apply_production_registration_import.
--
-- Applying a reviewed production import failed in production with
-- PostgreSQL error 42804:
--
--   column "payment_status" is of type public.payment_status
--   but expression is of type text
--
-- The deployed 20260723120000_create_manual_production_workflow.sql assigns
--
--   case when v_group.order_total > 0 then 'amount_recorded'
--        else 'unknown' end
--
-- to graduation_registrations.payment_status. Both branches are untyped
-- literals, so the CASE resolves to text and PostgreSQL refuses the
-- assignment to the enum column. The literal 'eligible' assigned to
-- registration_status coerces on its own, but is cast here too so a later
-- edit that wraps it in an expression cannot reintroduce the same class of
-- failure.
--
-- This migration is additive and replaces the function body only. The
-- deployed migration is left byte-for-byte as it was applied. Nothing else
-- about the function changes: same parameters, same return type, same
-- SECURITY DEFINER model, same empty search_path, same matching, guest,
-- source-order-linking, idempotency and status-transition behaviour. No
-- table, type, index, trigger or row is touched.

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
        'eligible'::public.registration_status,
        case when v_group.order_total > 0
             then 'amount_recorded'::public.payment_status
             else 'unknown'::public.payment_status end,
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
          registration_status = 'eligible'::public.registration_status,
          payment_status = case when v_group.order_total > 0
                                then 'amount_recorded'::public.payment_status
                                else 'unknown'::public.payment_status end,
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

-- Reapplied because create or replace resets nothing but is cheap to restate:
-- the function stays server-side only and is never callable from a browser
-- session.
revoke all on function public.apply_production_registration_import(uuid, uuid)
  from public, anon, authenticated;
