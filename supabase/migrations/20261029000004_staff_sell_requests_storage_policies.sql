-- ============================================================================
-- IT HUB — Staff Sell Requests Storage Policies & Access Permissions
-- Migration: 20261029000004_staff_sell_requests_storage_policies.sql
-- ============================================================================

-- Allow authorized staff to read and create signed URLs for sell request photos
drop policy if exists staff_sell_photos_select on storage.objects;
create policy staff_sell_photos_select on storage.objects
  for select using (
    bucket_id = 'sell-request-photos' and (public.is_admin() or public.is_staff())
  );

-- Allow authorized staff to read and create signed URLs for customer invoices
drop policy if exists staff_customer_invoices_select on storage.objects;
create policy staff_customer_invoices_select on storage.objects
  for select using (
    bucket_id = 'customer-invoices' and (public.is_admin() or public.is_staff())
  );

-- Recreate staff_update_sell_request with service_role fallback for staff_user_id audit
create or replace function public.staff_update_sell_request(
  p_request_id uuid,
  p_status text,
  p_admin_notes text default null,
  p_offered_price numeric default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old_status text;
  v_staff_id uuid := auth.uid();
begin
  if not public.is_staff() then
    raise exception 'Unauthorized: Staff permissions required to process sell requests.';
  end if;

  if p_status not in ('Pending', 'Under Review', 'Contacted', 'Approved', 'Rejected', 'Completed') then
    raise exception 'Invalid sell request status.';
  end if;

  if v_staff_id is null then
    select user_id into v_staff_id
    from public.staff_members
    where role = 'portal_admin' and is_active = true
    order by created_at asc
    limit 1;
  end if;

  select status into v_old_status
  from public.sell_requests
  where id = p_request_id;

  if not found then
    raise exception 'Sell request not found.';
  end if;

  update public.sell_requests
  set
    status = p_status,
    admin_notes = coalesce(p_admin_notes, admin_notes),
    offered_price = coalesce(p_offered_price, offered_price),
    updated_at = now()
  where id = p_request_id;

  -- Record audit log
  insert into public.staff_audit_logs (
    staff_user_id,
    action_type,
    entity_type,
    entity_id,
    previous_status,
    new_status,
    metadata
  ) values (
    v_staff_id,
    'UPDATE_SELL_REQUEST',
    'sell_request',
    p_request_id::text,
    v_old_status,
    p_status,
    jsonb_build_object(
      'offered_price', p_offered_price,
      'has_admin_notes', p_admin_notes is not null,
      'processed_by', v_staff_id,
      'timestamp', now()
    )
  );

  return jsonb_build_object('success', true, 'status', p_status);
end;
$$;

grant execute on function public.staff_update_sell_request(uuid, text, text, numeric) to authenticated;
