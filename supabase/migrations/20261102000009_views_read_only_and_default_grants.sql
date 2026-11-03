-- Public views must be read-only, and new objects must not be writable by default.
--
-- live_offers and public_coupons are simple views, so Postgres lets callers write through them.
-- They run as their owner, which bypasses RLS, and default privileges gave anon INSERT, UPDATE and
-- DELETE on them. An anonymous caller could rewrite or delete any active coupon.

revoke insert, update, delete, truncate, references, trigger
  on public.live_offers, public.public_coupons, public.products_public,
     public.service_requests_staff, public.pc_builds_staff
  from public, anon, authenticated, service_role;

-- MAINTAIN only exists from Postgres 17.
do $$
declare
  r record;
begin
  if current_setting('server_version_num')::int >= 170000 then
    for r in
      select c.relname
      from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm')
    loop
      execute format('revoke maintain on public.%I from anon, authenticated', r.relname);
    end loop;
  end if;
end $$;

-- A default ACL set per schema can't remove what the global default grants. EXECUTE for PUBLIC is
-- a global default, so it needs its own statement or every new function stays callable by anyone.
alter default privileges for role postgres revoke execute on functions from public;

-- New tables and views: anon can read, subject to RLS, and nothing else. Signed-in users get the
-- usual write privileges, subject to RLS. Views still need an explicit revoke, as above.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public grant select on tables to anon;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to authenticated;
