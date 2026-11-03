-- Customers sign in with a mobile number and an OTP, and Supabase Auth is the only proof of it.
--
-- A customer's number comes from Auth once confirmed, never from the customer. Previously anyone
-- could put any number on their profile, and because profile numbers are unique, that could stop the
-- number's real owner from signing up.

create or replace function private.verified_phone(p_phone text, p_confirmed_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_confirmed_at is null or nullif(trim(coalesce(p_phone, '')), '') is null then null
    else '+' || ltrim(trim(p_phone), '+')
  end;
$$;

revoke all on function private.verified_phone(text, timestamptz) from public;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := private.verified_phone(new.phone, new.phone_confirmed_at);
  v_email text := nullif(trim(new.email), '');
  v_confirmed boolean := new.phone_confirmed_at is not null or new.email_confirmed_at is not null;
  v_full_name text;
  v_address text;
begin
  -- Anyone can start a sign-up for any number, so what they supply can't reach the profile that the
  -- number's real owner will get.
  if v_confirmed then
    v_full_name := nullif(trim(coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    )), '');
    v_address := nullif(trim(coalesce(new.raw_user_meta_data->>'address', '')), '');
  end if;

  -- A number confirmed by OTP belongs to this account, so no other profile may keep claiming it.
  if v_phone is not null then
    update public.profiles set phone = null, updated_at = now()
    where phone = v_phone and id <> new.id;
  end if;

  insert into public.profiles (id, role, full_name, phone, email, address, created_at, updated_at)
  values (new.id, 'customer', v_full_name, v_phone, v_email, v_address, now(), now())
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    phone = coalesce(excluded.phone, public.profiles.phone),
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    address = coalesce(excluded.address, public.profiles.address),
    updated_at = now();
  return new;
end;
$$;

-- Auth creates the user when the OTP is requested, and confirms the number when it's verified. The
-- profile only takes the number at that second step.
create or replace function public.sync_profile_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := private.verified_phone(new.phone, new.phone_confirmed_at);
begin
  if v_phone is null then
    return new;
  end if;

  update public.profiles set phone = null, updated_at = now()
  where phone = v_phone and id <> new.id;

  update public.profiles set phone = v_phone, updated_at = now()
  where id = new.id and phone is distinct from v_phone;

  return new;
end;
$$;

drop trigger if exists on_auth_user_phone_confirmed on auth.users;
create trigger on_auth_user_phone_confirmed
  after update of phone, phone_confirmed_at on auth.users
  for each row execute function public.sync_profile_phone();

revoke execute on function public.sync_profile_phone() from public, anon, authenticated, service_role;

create or replace function public.ensure_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user record;
  v_profile record;
begin
  if v_user_id is null then
    raise exception 'Authentication required to ensure profile' using errcode = '42501';
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
    null,
    private.verified_phone(v_user.phone, v_user.phone_confirmed_at),
    nullif(trim(v_user.email), ''),
    null,
    now(),
    now()
  )
  on conflict (id) do update set updated_at = now()
  returning * into v_profile;

  return jsonb_build_object('ok', true, 'created', true, 'profile', to_jsonb(v_profile));
end;
$$;

-- Through the API, nobody sets a profile's number, including administrators: it comes from Auth.
create or replace function public.protect_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_caller() is not true then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role is distinct from 'customer' and public.is_admin() is not true then
      raise exception 'Unauthorized: only administrators can create admin accounts.'
        using errcode = '42501';
    end if;
    if new.phone is not null then
      raise exception 'A mobile number is added by verifying it with an OTP.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role and public.is_admin() is not true then
    raise exception 'Unauthorized: only administrators can modify roles.'
      using errcode = '42501';
  end if;
  if new.phone is distinct from old.phone then
    raise exception 'A mobile number can only be changed by verifying it with an OTP.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Checkout tokens go only to a session whose mobile number Supabase Auth has confirmed.
create or replace function public.create_checkout_association()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then
    raise exception 'Authentication required to create checkout association' using errcode = '42501';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = v_uid
      and u.phone_confirmed_at is not null
      and nullif(trim(coalesce(u.phone, '')), '') is not null
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
  ) then
    raise exception 'A verified mobile number is required to check out' using errcode = '42501';
  end if;

  v_token := 'hub_assoc_' || encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.shopify_order_associations (token, user_id, expires_at)
  values (v_token, v_uid, now() + interval '14 days');

  return v_token;
end;
$$;

-- Auth's "before user created" hook. Staff still sign in by email, so the Email provider has to stay
-- on, which on its own would let anyone register by email. Only an Indian mobile number can register.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if coalesce(event->'user'->>'phone', '') ~ '^\+?91[6-9][0-9]{9}$' then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Please sign up with an Indian mobile number.'
  ));
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- Auth's phone sign-up also accepts a password, and has no setting to turn that off. Someone could
-- register a stranger's number with their own password, wait for the real owner to verify an OTP,
-- then sign in to the owner's account with that password. So an account with no email address never
-- holds a password: the OTP is the only way in. Staff accounts have an email address.
create or replace function private.clear_phone_account_password()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if nullif(trim(coalesce(new.email, '')), '') is null then
    new.encrypted_password := '';
  end if;
  return new;
end;
$$;

revoke all on function private.clear_phone_account_password() from public;

drop trigger if exists on_auth_user_phone_only_no_password on auth.users;
create trigger on_auth_user_phone_only_no_password
  before insert or update of encrypted_password, email on auth.users
  for each row execute function private.clear_phone_account_password();
