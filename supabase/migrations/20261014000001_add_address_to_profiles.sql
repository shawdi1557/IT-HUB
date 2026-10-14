-- ============================================================================
-- Migration: Add address column to public.profiles
-- Target: Supabase / PostgreSQL
-- Fixes: PostgreSQL error 42703: column profiles.address does not exist
-- ============================================================================

begin;

-- 1. Add address text column to public.profiles table if not present
alter table public.profiles
  add column if not exists address text;

-- 2. Update ensure_profile() self-healing function to include address from metadata
create or replace function public.ensure_profile() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid;
  v_user record;
  v_profile record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required to ensure profile';
  end if;

  select * into v_profile from public.profiles where id = v_user_id;
  if found then
    return jsonb_build_object('ok', true, 'created', false, 'profile', to_jsonb(v_profile));
  end if;

  select * into v_user from auth.users where id = v_user_id;
  if not found then
    raise exception 'Authenticated user record not found';
  end if;

  insert into public.profiles (id, role, full_name, phone, email, address, created_at, updated_at)
  values (
    v_user.id,
    'customer',
    nullif(trim(coalesce(v_user.raw_user_meta_data->>'full_name', v_user.raw_user_meta_data->>'name')), ''),
    nullif(trim(v_user.phone), ''),
    nullif(trim(v_user.email), ''),
    nullif(trim(coalesce(v_user.raw_user_meta_data->>'address', '')), ''),
    now(),
    now()
  )
  on conflict (id) do update set
    updated_at = now()
  returning * into v_profile;

  return jsonb_build_object('ok', true, 'created', true, 'profile', to_jsonb(v_profile));
end;
$$;

revoke all on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;

-- 3. Update handle_new_user() trigger to populate address from user metadata
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_phone text;
  v_email text;
  v_full_name text;
  v_address text;
begin
  v_phone := nullif(trim(new.phone), '');
  v_email := nullif(trim(new.email), '');
  v_full_name := nullif(trim(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name'
  )), '');
  v_address := nullif(trim(coalesce(
    new.raw_user_meta_data->>'address',
    ''
  )), '');

  -- Pre-validate unique phone to prevent orphaned auth.users records on constraint failure
  if v_phone is not null and exists (select 1 from public.profiles where phone = v_phone and id <> new.id) then
    raise exception 'Phone number % is already registered to another account', v_phone;
  end if;

  insert into public.profiles (id, role, full_name, phone, email, address, created_at, updated_at)
  values (new.id, 'customer', v_full_name, v_phone, v_email, v_address, now(), now())
  on conflict (id) do update set
    email = coalesce(excluded.email, profiles.email),
    phone = coalesce(excluded.phone, profiles.phone),
    full_name = coalesce(excluded.full_name, profiles.full_name),
    address = coalesce(excluded.address, profiles.address),
    updated_at = now();
  return new;
end;
$$;

commit;
