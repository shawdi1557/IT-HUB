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

commit;
