-- Identity and authorization helpers.
--
-- Rules these functions follow:
--   * The caller is who the verified JWT says: auth.uid(). Nothing else identifies a person.
--     session_user and current_user describe database connections and function owners, and were
--     the cause of every caller being treated as an administrator.
--   * One resolver decides staff roles: public.get_current_staff_role().
--   * Boolean helpers always return true or false, never NULL, because "if not NULL" doesn't refuse.
--   * The service role is a server credential, not a person. It bypasses RLS on its own, so the
--     helpers below answer about human staff only.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- True when a write is running directly under an API role, rather than inside a SECURITY DEFINER
-- function, under the service role, or in a migration. Only protection triggers may use this, and
-- only to tighten checks: it never admits anyone. It has to be SECURITY INVOKER, and so does every
-- trigger that calls it, because a definer would always see its own owner here.
create or replace function private.is_api_caller()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select current_user in ('anon', 'authenticated');
$$;

revoke all on function private.is_api_caller() from public;
grant execute on function private.is_api_caller() to anon, authenticated, service_role;

-- The single source of a person's staff role. A profile with role 'admin' and an active
-- staff_members row with role 'portal_admin' both mean portal_admin.
create or replace function public.get_current_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then null
    when exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    ) then 'portal_admin'
    else (
      select sm.role from public.staff_members sm
      where sm.user_id = auth.uid() and sm.is_active = true
      limit 1
    )
  end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.get_current_staff_role() = 'portal_admin', false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_current_staff_role() is not null;
$$;

create or replace function public.can_manage_services()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.get_current_staff_role() in ('portal_admin', 'service_staff'), false);
$$;

create or replace function public.can_manage_quotations()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.get_current_staff_role() in ('portal_admin', 'quotation_staff'), false);
$$;

create or replace function public.can_manage_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.get_current_staff_role() = 'portal_admin', false);
$$;
