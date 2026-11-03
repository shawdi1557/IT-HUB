-- Storage buckets and policies that existed only in supabase/storage-policies.sql, so a project
-- built from migrations had no working sell-request or product uploads. promotional-banners
-- comes from 20261031000005; its limits are restated here so all four live in one place.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Public storefront media. SVG is excluded to prevent stored XSS.
  ('product-images', 'product-images', true, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('promotional-banners', 'promotional-banners', true, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  -- Private. Paths are {customer_id}/{request_id}/{filename}, served by short-lived signed URLs.
  ('sell-request-photos', 'sell-request-photos', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('customer-invoices', 'customer-invoices', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Product images
drop policy if exists "Product Images Public Read" on storage.objects;
drop policy if exists "Product Images Admin Insert" on storage.objects;
drop policy if exists "Product Images Admin Update" on storage.objects;
drop policy if exists "Product Images Admin Delete" on storage.objects;

create policy "Product Images Public Read" on storage.objects
  for select using (bucket_id = 'product-images');

create policy "Product Images Admin Insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin() is true);

create policy "Product Images Admin Update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin() is true)
  with check (bucket_id = 'product-images' and public.is_admin() is true);

create policy "Product Images Admin Delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin() is true);

-- Sell request photos
drop policy if exists "Sell Photos Customer Read" on storage.objects;
drop policy if exists "Sell Photos Customer Insert" on storage.objects;
drop policy if exists "Sell Photos Customer Delete" on storage.objects;
drop policy if exists "Sell Photos Admin All" on storage.objects;
drop policy if exists staff_sell_photos_select on storage.objects;

create policy "Sell Photos Customer Read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'sell-request-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_staff() is true
    )
  );

create policy "Sell Photos Customer Insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sell-request-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.sell_requests sr
      where sr.id::text = (storage.foldername(name))[2]
        and sr.customer_id = auth.uid()
        and sr.status = 'Pending'
    )
  );

create policy "Sell Photos Customer Delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'sell-request-photos'
    and (
      (
        (storage.foldername(name))[1] = auth.uid()::text
        and exists (
          select 1 from public.sell_requests sr
          where sr.id::text = (storage.foldername(name))[2]
            and sr.customer_id = auth.uid()
            and sr.status = 'Pending'
        )
      )
      or public.is_admin() is true
    )
  );

-- Customer invoices
drop policy if exists "Invoices Strict Private Read" on storage.objects;
drop policy if exists "Invoices Customer Insert" on storage.objects;
drop policy if exists "Invoices Customer Delete" on storage.objects;
drop policy if exists "Invoices Admin All" on storage.objects;
drop policy if exists staff_customer_invoices_select on storage.objects;

create policy "Invoices Strict Private Read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'customer-invoices'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_staff() is true
    )
  );

create policy "Invoices Customer Insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'customer-invoices'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      exists (
        select 1 from public.sell_requests sr
        where sr.id::text = (storage.foldername(name))[2]
          and sr.customer_id = auth.uid()
          and sr.status = 'Pending'
      )
      or exists (
        select 1 from public.service_requests sr
        where sr.id::text = (storage.foldername(name))[2]
          and sr.user_id = auth.uid()
          and sr.status = 'Booked'
      )
    )
  );

create policy "Invoices Customer Delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'customer-invoices'
    and (
      (
        (storage.foldername(name))[1] = auth.uid()::text
        and (
          exists (
            select 1 from public.sell_requests sr
            where sr.id::text = (storage.foldername(name))[2]
              and sr.customer_id = auth.uid()
              and sr.status = 'Pending'
          )
          or exists (
            select 1 from public.service_requests sr
            where sr.id::text = (storage.foldername(name))[2]
              and sr.user_id = auth.uid()
              and sr.status = 'Booked'
          )
        )
      )
      or public.is_admin() is true
    )
  );

create policy "Invoices Admin All" on storage.objects
  for all to authenticated
  using (bucket_id = 'customer-invoices' and public.is_admin() is true)
  with check (bucket_id = 'customer-invoices' and public.is_admin() is true);

-- Promotional banners: the earlier policies were open to the public role with an is_staff check.
-- Restated for authenticated staff only, with a check on update too.
drop policy if exists "Promotional Banners Staff Insert" on storage.objects;
drop policy if exists "Promotional Banners Staff Update" on storage.objects;
drop policy if exists "Promotional Banners Staff Delete" on storage.objects;

create policy "Promotional Banners Staff Insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'promotional-banners' and public.is_staff() is true);

create policy "Promotional Banners Staff Update" on storage.objects
  for update to authenticated
  using (bucket_id = 'promotional-banners' and public.is_staff() is true)
  with check (bucket_id = 'promotional-banners' and public.is_staff() is true);

create policy "Promotional Banners Staff Delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'promotional-banners' and public.is_staff() is true);
