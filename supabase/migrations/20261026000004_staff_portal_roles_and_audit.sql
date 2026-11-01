-- ============================================================================
-- Migration: Phase 7 - Staff Portal Roles, Fine-Grained Permissions & Audit Trail
-- Target: Supabase / PostgreSQL
-- ============================================================================

begin;

-- 1. Dedicated Staff Members Table (Decoupled from customer profiles)
create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('portal_admin', 'quotation_staff', 'service_staff')),
  full_name text not null,
  email text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_members_user_idx on public.staff_members (user_id);
create index if not exists staff_members_role_idx on public.staff_members (role);
create index if not exists staff_members_active_idx on public.staff_members (is_active);

-- Enable RLS on staff_members
alter table public.staff_members enable row level security;

-- 2. Staff Permission & Role Resolution Helper Functions
create or replace function public.get_current_staff_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    -- 1. Check if user is superuser, service_role, or existing primary administrator
    case
      when (auth.uid() is null and coalesce(session_user in ('postgres', 'supabase_admin'), false))
        or coalesce(nullif(current_setting('request.jwt.claim.role', true), '') = 'service_role', false)
        or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
      then 'portal_admin'
      else (
        select role from public.staff_members
        where user_id = auth.uid() and is_active = true
        limit 1
      )
    end,
    null
  );
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.get_current_staff_role() is not null;
$$;

create or replace function public.can_manage_quotations() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.get_current_staff_role() in ('portal_admin', 'quotation_staff');
$$;

create or replace function public.can_manage_services() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.get_current_staff_role() in ('portal_admin', 'service_staff');
$$;

create or replace function public.can_manage_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.get_current_staff_role() = 'portal_admin';
$$;

-- 3. Staff Members Self-Modification & Privilege Escalation Guard
create or replace function public.protect_staff_member() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_manage_staff() then
    raise exception 'Unauthorized: Only Portal Administrators can create, modify, or deactivate staff accounts.';
  end if;
  return new;
end;
$$;

drop trigger if exists staff_members_protect on public.staff_members;
create trigger staff_members_protect
  before insert or update or delete on public.staff_members
  for each row execute function public.protect_staff_member();

-- Staff Members RLS Policies
drop policy if exists staff_members_select on public.staff_members;
create policy staff_members_select on public.staff_members
  for select to authenticated
  using (public.is_staff());

drop policy if exists staff_members_insert on public.staff_members;
create policy staff_members_insert on public.staff_members
  for insert to authenticated
  with check (public.can_manage_staff());

drop policy if exists staff_members_update on public.staff_members;
create policy staff_members_update on public.staff_members
  for update to authenticated
  using (public.can_manage_staff())
  with check (public.can_manage_staff());

drop policy if exists staff_members_delete on public.staff_members;
create policy staff_members_delete on public.staff_members
  for delete to authenticated
  using (public.can_manage_staff());

-- 4. Append-Only Staff Audit Log Table
create table if not exists public.staff_audit_logs (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references auth.users(id),
  action_type text not null,
  entity_type text not null check (entity_type in ('pc_quotation', 'service_request', 'staff_membership')),
  entity_id text not null,
  previous_status text,
  new_status text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists staff_audit_logs_entity_idx on public.staff_audit_logs (entity_type, entity_id);
create index if not exists staff_audit_logs_staff_idx on public.staff_audit_logs (staff_user_id, created_at desc);

alter table public.staff_audit_logs enable row level security;

-- Audit Log RLS (Append-only: select and insert permitted to staff; update/delete strictly prohibited)
drop policy if exists staff_audit_logs_select on public.staff_audit_logs;
create policy staff_audit_logs_select on public.staff_audit_logs
  for select to authenticated
  using (public.is_staff());

drop policy if exists staff_audit_logs_insert on public.staff_audit_logs;
create policy staff_audit_logs_insert on public.staff_audit_logs
  for insert to authenticated
  with check (public.is_staff() and (auth.uid() = staff_user_id or public.can_manage_staff()));

-- 5. Extend pc_builds Table with Staff Fields & Update RLS
alter table public.pc_builds
  add column if not exists staff_notes text,
  add column if not exists assigned_staff_id uuid references auth.users(id) on delete set null;

create index if not exists pc_builds_assigned_idx on public.pc_builds (assigned_staff_id);
create index if not exists pc_builds_status_idx on public.pc_builds (enquiry_status);

-- Update pc_builds RLS to allow quotation staff access
drop policy if exists pc_builds_select on public.pc_builds;
create policy pc_builds_select on public.pc_builds
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_quotations());

drop policy if exists pc_builds_update on public.pc_builds;
create policy pc_builds_update on public.pc_builds
  for update to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_quotations())
  with check (user_id = (select auth.uid()) or public.can_manage_quotations());

-- Update protect_pc_build trigger function to recognize quotation staff
create or replace function public.protect_pc_build() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (public.is_admin() or public.can_manage_quotations()) then
    if tg_op = 'INSERT' then
      -- Quotation submissions strictly require an authenticated customer account
      if (new.reference_id is not null or new.enquiry_status in ('New', 'Contacted', 'Quoted', 'Closed')) and new.user_id is null then
        raise exception 'Unauthorized: PC quotation submission requires an authenticated customer account. Please sign in.';
      end if;

      if auth.uid() is not null then
        if new.user_id is distinct from auth.uid() then
          raise exception 'Unauthorized: PC Build user_id must match authenticated user';
        end if;
      else
        if new.user_id is not null then
          raise exception 'Unauthorized: Guest PC Build requests cannot claim a user_id';
        end if;
      end if;

      if new.enquiry_status not in ('Draft', 'New') then
        raise exception 'Unauthorized: New PC build enquiry must start as Draft or New';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
        raise exception 'Unauthorized: PC Build identity and ownership are immutable';
      end if;
      if new.enquiry_status is distinct from old.enquiry_status and new.enquiry_status in ('Contacted', 'Quoted', 'Closed') then
        raise exception 'Unauthorized: Only authorized staff can update PC build status to %', new.enquiry_status;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- 6. Update service_requests RLS to allow service staff access
drop policy if exists service_requests_select on public.service_requests;
create policy service_requests_select on public.service_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_services());

drop policy if exists service_requests_update on public.service_requests;
create policy service_requests_update on public.service_requests
  for update to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_services())
  with check (user_id = (select auth.uid()) or public.can_manage_services());

-- Update protect_service_request trigger function to recognize service staff
create or replace function public.protect_service_request() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (public.is_admin() or public.can_manage_services()) then
    if tg_op = 'INSERT' then
      if new.user_id is distinct from auth.uid() then
        raise exception 'Unauthorized: Service request user_id must match authenticated user';
      end if;
      if new.status is distinct from 'Booked' then
        raise exception 'Unauthorized: New service request must start with Booked status';
      end if;
      if new.quote is not null or new.quote_state is not null then
        raise exception 'Unauthorized: Customers cannot set initial quotation values';
      end if;
      if new.technician_name is not null then
        raise exception 'Unauthorized: Customers cannot assign technicians';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
        raise exception 'Unauthorized: Service request identity and ownership are immutable';
      end if;

      if new.status is distinct from old.status and new.status not in ('Cancelled') then
        raise exception 'Unauthorized: Customers can only transition a service request to Cancelled';
      end if;

      if new.technician_name is distinct from old.technician_name then
        raise exception 'Unauthorized: Customers cannot modify technician assignment';
      end if;

      if new.quote is distinct from old.quote then
        raise exception 'Unauthorized: Customers cannot modify quote amount';
      end if;

      if new.quote_state is distinct from old.quote_state then
        raise exception 'Unauthorized: Quote state must be updated via quote decision workflow';
      end if;

      if new.notes is distinct from old.notes then
        raise exception 'Unauthorized: Customers cannot modify internal service notes';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- 7. Staff Operational RPCs with Atomic Audit Logging
create or replace function public.staff_update_pc_quotation_status(
  p_quotation_id uuid,
  p_new_status text,
  p_staff_notes text default null,
  p_assigned_staff_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old_status text;
  v_staff_id uuid := auth.uid();
  v_build record;
begin
  if not public.can_manage_quotations() then
    raise exception 'Unauthorized: Staff quotation management permissions required.';
  end if;

  if p_new_status not in ('Draft', 'New', 'Contacted', 'Quoted', 'Closed') then
    raise exception 'Invalid status: %', p_new_status;
  end if;

  select * into v_build from public.pc_builds where id = p_quotation_id for update;
  if not found then
    raise exception 'PC Quotation record % not found.', p_quotation_id;
  end if;

  v_old_status := v_build.enquiry_status;

  update public.pc_builds
  set
    enquiry_status = p_new_status,
    staff_notes = coalesce(p_staff_notes, staff_notes),
    assigned_staff_id = coalesce(p_assigned_staff_id, assigned_staff_id),
    updated_at = now()
  where id = p_quotation_id;

  -- Insert immutable staff audit record
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
    'pc_quotation_status_update',
    'pc_quotation',
    p_quotation_id::text,
    v_old_status,
    p_new_status,
    jsonb_build_object(
      'notes_appended', p_staff_notes is not null,
      'assigned_staff_id', p_assigned_staff_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'quotation_id', p_quotation_id,
    'previous_status', v_old_status,
    'new_status', p_new_status
  );
end;
$$;

create or replace function public.staff_update_service_status(
  p_service_id uuid,
  p_new_status text,
  p_technician_name text default null,
  p_internal_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old_status text;
  v_staff_id uuid := auth.uid();
  v_req record;
begin
  if not public.can_manage_services() then
    raise exception 'Unauthorized: Staff service management permissions required.';
  end if;

  if p_new_status not in ('Booked', 'Device Received', 'Under Diagnosis', 'In Progress', 'Diagnosis Done', 'Awaiting Approval', 'Completed', 'Cancelled', 'Delivered', 'Returned') then
    raise exception 'Invalid status: %', p_new_status;
  end if;

  select * into v_req from public.service_requests where id = p_service_id for update;
  if not found then
    raise exception 'Service request record % not found.', p_service_id;
  end if;

  v_old_status := v_req.status;

  update public.service_requests
  set
    status = p_new_status,
    technician_name = coalesce(p_technician_name, technician_name),
    notes = coalesce(p_internal_notes, notes),
    updated_at = now()
  where id = p_service_id;

  -- Insert immutable staff audit record
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
    'service_status_update',
    'service_request',
    p_service_id::text,
    v_old_status,
    p_new_status,
    jsonb_build_object(
      'technician_name', p_technician_name,
      'notes_updated', p_internal_notes is not null
    )
  );

  return jsonb_build_object(
    'ok', true,
    'service_id', p_service_id,
    'previous_status', v_old_status,
    'new_status', p_new_status
  );
end;
$$;

create or replace function public.get_staff_portal_profile() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_member record;
  v_profile record;
begin
  if v_user_id is null then
    return jsonb_build_object('is_staff', false, 'error', 'Unauthenticated');
  end if;

  v_role := public.get_current_staff_role();
  if v_role is null then
    return jsonb_build_object('is_staff', false, 'error', 'Unauthorized');
  end if;

  select * into v_member from public.staff_members where user_id = v_user_id and is_active = true limit 1;
  select * into v_profile from public.profiles where id = v_user_id limit 1;

  return jsonb_build_object(
    'is_staff', true,
    'user_id', v_user_id,
    'role', v_role,
    'full_name', coalesce(v_member.full_name, v_profile.full_name, 'IT HUB Staff'),
    'email', coalesce(v_member.email, v_profile.email, ''),
    'permissions', jsonb_build_object(
      'can_manage_quotations', public.can_manage_quotations(),
      'can_manage_services', public.can_manage_services(),
      'can_manage_staff', public.can_manage_staff()
    )
  );
end;
$$;

-- 8. Execution Grants
grant execute on function public.get_current_staff_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.can_manage_quotations() to authenticated;
grant execute on function public.can_manage_services() to authenticated;
grant execute on function public.can_manage_staff() to authenticated;
grant execute on function public.get_staff_portal_profile() to authenticated;
grant execute on function public.staff_update_pc_quotation_status(uuid, text, text, uuid) to authenticated;
grant execute on function public.staff_update_service_status(uuid, text, text, text) to authenticated;

grant select, insert, update, delete on public.staff_members to authenticated;
grant select, insert on public.staff_audit_logs to authenticated;

commit;

