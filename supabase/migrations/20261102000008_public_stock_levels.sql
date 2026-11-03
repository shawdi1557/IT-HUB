-- The storefront shows live stock from Realtime, but no policy ever let visitors read inventory.
-- It only worked because of the identity flaw that made every Realtime subscriber an administrator.
-- Stock levels are already public through products_public, so this states it explicitly.
drop policy if exists inventory_public_read on public.inventory;
create policy inventory_public_read on public.inventory
  for select to anon, authenticated
  using (true);
