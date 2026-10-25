-- ============================================================================
-- Migration: Phase 5.3 - PC Builder Quotation Persistence & Guest Quotations
-- Target: Supabase / PostgreSQL
-- ============================================================================

begin;

-- 1. Extend pc_builds table with quotation reference, customer info & compatibility details
alter table public.pc_builds
  add column if not exists reference_id text unique,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_email text,
  add column if not exists compatibility jsonb not null default '{}'::jsonb;

-- 2. Allow guest quotation requests by making user_id nullable
alter table public.pc_builds
  alter column user_id drop not null;

-- 3. Create index on quotation reference ID for fast lookup
create index if not exists pc_builds_reference_id_idx on public.pc_builds (reference_id);

-- 4. Update protect_pc_build trigger function to support authenticated and guest quotation requests
create or replace function public.protect_pc_build() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    if tg_op = 'INSERT' then
      -- If client is authenticated, enforce user_id matches auth.uid()
      if auth.uid() is not null then
        if new.user_id is distinct from auth.uid() then
          raise exception 'Unauthorized: PC Build user_id must match authenticated user';
        end if;
      else
        -- If client is unauthenticated (guest), user_id must be null
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
        raise exception 'Unauthorized: Only administrators can update PC build status to %', new.enquiry_status;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- 5. Secure RPC: submit_pc_quotation_request
-- Allows both authenticated customers and guests to submit quotation requests reliably
create or replace function public.submit_pc_quotation_request(
  p_build_name text,
  p_reference_id text default null,
  p_parts jsonb default '{}'::jsonb,
  p_estimated_price numeric default 0,
  p_compatibility jsonb default '{}'::jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_email text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_build_id uuid;
  v_ref text;
  v_name text;
begin
  -- 1. Authoritative user derivation (never trust client-supplied user_id)
  v_user_id := auth.uid();

  -- 2. Build name sanitization
  v_name := coalesce(nullif(trim(p_build_name), ''), 'Custom PC Build');

  -- 3. Reference ID generation / validation
  if p_reference_id is not null and trim(p_reference_id) <> '' then
    v_ref := trim(p_reference_id);
  else
    v_ref := 'ITH-PC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;

  -- 4. Validate estimated price
  if p_estimated_price is null or p_estimated_price < 0 then
    raise exception 'Invalid estimated price: %', p_estimated_price;
  end if;

  -- 5. Validate parts payload
  if p_parts is null or (jsonb_typeof(p_parts) != 'object' and jsonb_typeof(p_parts) != 'array') then
    raise exception 'Invalid parts payload';
  end if;

  -- 6. Insert new quotation request with status 'New'
  insert into public.pc_builds (
    user_id,
    name,
    reference_id,
    parts,
    estimated_price,
    compatibility,
    customer_name,
    customer_phone,
    customer_email,
    enquiry_status,
    created_at,
    updated_at
  ) values (
    v_user_id,
    v_name,
    v_ref,
    p_parts,
    p_estimated_price,
    coalesce(p_compatibility, '{}'::jsonb),
    nullif(trim(p_customer_name), ''),
    nullif(trim(p_customer_phone), ''),
    nullif(trim(p_customer_email), ''),
    'New',
    now(),
    now()
  ) returning id into v_build_id;

  return jsonb_build_object(
    'success', true,
    'id', v_build_id,
    'reference_id', v_ref,
    'user_id', v_user_id,
    'estimated_price', p_estimated_price
  );
exception when others then
  return jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
end;
$$;

-- 6. Permissions
grant execute on function public.submit_pc_quotation_request to anon, authenticated;

commit;
