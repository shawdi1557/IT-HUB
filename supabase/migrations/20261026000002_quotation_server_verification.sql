-- ============================================================================
-- Migration: Phase 5 - Server-Side Quotation Verification & Distributed Rate Limiting
-- Target: Supabase / PostgreSQL
-- ============================================================================

begin;

-- 1. Extend pc_builds with authoritative pricing and tampering audit columns
alter table public.pc_builds
  add column if not exists authoritative_price numeric,
  add column if not exists price_divergence numeric default 0,
  add column if not exists technician_review_required boolean default false;

-- 2. Distributed Rate Limits Table
create table if not exists public.rate_limits (
  ip_hash text not null,
  endpoint text not null,
  request_count integer not null default 1,
  window_start timestamptz not null default now(),
  primary key (ip_hash, endpoint)
);

-- Enable RLS on rate_limits
alter table public.rate_limits enable row level security;

-- Policy: Only service_role can read/write rate limits
drop policy if exists "service_role_rate_limits_policy" on public.rate_limits;
create policy "service_role_rate_limits_policy"
  on public.rate_limits
  for all
  to service_role
  using (true)
  with check (true);

-- 3. Atomic Distributed Rate Limiting RPC
create or replace function public.check_distributed_rate_limit(
  p_ip_hash text,
  p_endpoint text,
  p_max_requests integer default 5,
  p_window_seconds integer default 60
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_count integer;
  v_window_start timestamptz;
begin
  select request_count, window_start into v_count, v_window_start
  from public.rate_limits
  where ip_hash = p_ip_hash and endpoint = p_endpoint
  for update;

  if not found then
    insert into public.rate_limits (ip_hash, endpoint, request_count, window_start)
    values (p_ip_hash, p_endpoint, 1, v_now);
    return true;
  end if;

  -- Check if current window has expired
  if v_now - v_window_start > (p_window_seconds || ' seconds')::interval then
    update public.rate_limits
    set request_count = 1,
        window_start = v_now
    where ip_hash = p_ip_hash and endpoint = p_endpoint;
    return true;
  end if;

  -- Window is still active: check request threshold
  if v_count >= p_max_requests then
    return false; -- Rate limit exceeded
  end if;

  -- Increment count
  update public.rate_limits
  set request_count = request_count + 1
  where ip_hash = p_ip_hash and endpoint = p_endpoint;

  return true;
end;
$$;

grant execute on function public.check_distributed_rate_limit to service_role, postgres;

-- 4. Restrict legacy RPC submit_pc_quotation_request to service_role and postgres only.
-- Revoke all direct execution from anon and authenticated to seal direct client submission bypass.
revoke execute on function public.submit_pc_quotation_request(text, text, jsonb, numeric, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_pc_quotation_request(text, text, jsonb, numeric, jsonb, text, text, text) to service_role, postgres;

-- Replace function body with defense-in-depth caller role validation
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
  -- Defense-in-depth: Restrict direct invocation strictly to service_role and postgres
  if coalesce(current_setting('request.jwt.claim.role', true), auth.role(), '') not in ('service_role', 'postgres') and not is_admin() then
    raise exception 'Unauthorized: PC quotations must be submitted through the verified Edge Function endpoint.';
  end if;

  -- 1. Authoritative user derivation
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
    authoritative_price,
    price_divergence,
    technician_review_required,
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
    p_estimated_price,
    0,
    false,
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

commit;

