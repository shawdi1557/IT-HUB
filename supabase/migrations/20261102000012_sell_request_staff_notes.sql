-- sell_requests.admin_notes is staff-only. Customers keep status, offered price and everything else
-- about their own requests. Staff and customers share the "authenticated" role, so the column isn't
-- granted to it, and staff read through a view gated on their role, as with service tickets.

revoke select on public.sell_requests from authenticated;

grant select (
  id, customer_id, category, product_name, brand, model, condition, description, has_warranty,
  warranty_provider, warranty_remaining, warranty_details, expected_price, offered_price, status,
  created_at, updated_at
) on public.sell_requests to authenticated;

create or replace view public.sell_requests_staff
with (security_barrier = true)
as
  select s.*
  from public.sell_requests s
  where public.is_staff() is true;

revoke all on public.sell_requests_staff from public, anon, authenticated, service_role;
grant select on public.sell_requests_staff to authenticated, service_role;

-- MAINTAIN only exists from Postgres 17.
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on public.sell_requests_staff from anon, authenticated';
  end if;
end $$;
