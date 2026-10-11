-- ============================================================================
-- IT HUB — Supabase Storage Configuration & Access Control Policies
-- Buckets:
--   1. 'product-images'       (Public storefront media; SVG disallowed for XSS defense)
--   2. 'sell-request-photos'  (Customer hardware evaluation photos; customer-isolated)
--   3. 'customer-invoices'    (Strictly private invoices / proof of purchase)
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. BUCKET INITIALIZATION
-- ────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'product-images',
    'product-images',
    true,
    5242880, -- 5 MB
    -- SVG disallowed to prevent stored Cross-Site Scripting (XSS) attacks in public assets
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  ),
  (
    'sell-request-photos',
    'sell-request-photos',
    false, -- Private bucket
    10485760, -- 10 MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  ),
  (
    'customer-invoices',
    'customer-invoices',
    false, -- Strictly private bucket
    10485760, -- 10 MB
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Ensure RLS is enabled on storage objects
alter table storage.objects enable row level security;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. CLEANUP PREVIOUS POLICIES
-- ────────────────────────────────────────────────────────────────────────────

drop policy if exists "Product Images Public Read" on storage.objects;
drop policy if exists "Product Images Admin Insert" on storage.objects;
drop policy if exists "Product Images Admin Update" on storage.objects;
drop policy if exists "Product Images Admin Delete" on storage.objects;

drop policy if exists "Sell Photos Customer Read" on storage.objects;
drop policy if exists "Sell Photos Customer Insert" on storage.objects;
drop policy if exists "Sell Photos Customer Delete" on storage.objects;
drop policy if exists "Sell Photos Admin All" on storage.objects;

drop policy if exists "Invoices Strict Private Read" on storage.objects;
drop policy if exists "Invoices Customer Insert" on storage.objects;
drop policy if exists "Invoices Customer Delete" on storage.objects;
drop policy if exists "Invoices Admin All" on storage.objects;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. PRODUCT IMAGES (PUBLIC STOREFRONT CATALOG)
-- ────────────────────────────────────────────────────────────────────────────

-- Public reads: anyone (anon or authenticated) can view storefront product images
create policy "Product Images Public Read"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Admin write access: only administrators can upload, update or delete product catalog images
create policy "Product Images Admin Insert"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and is_admin());

create policy "Product Images Admin Update"
  on storage.objects for update
  using (bucket_id = 'product-images' and is_admin())
  with check (bucket_id = 'product-images' and is_admin());

create policy "Product Images Admin Delete"
  on storage.objects for delete
  using (bucket_id = 'product-images' and is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. SELL REQUEST PHOTOS (CUSTOMER HARDWARE SUBMISSION PHOTOS)
-- Object path convention: {customer_id}/{sell_request_id}/{filename}
-- ────────────────────────────────────────────────────────────────────────────

-- Read: Customer can only view their own uploaded hardware photos; admin can view all
create policy "Sell Photos Customer Read"
  on storage.objects for select
  using (
    bucket_id = 'sell-request-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or is_admin()
    )
  );

-- Insert: Authenticated customers can upload photos ONLY for real sell requests they own in 'Pending' status
create policy "Sell Photos Customer Insert"
  on storage.objects for insert
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

-- Delete: Customers can delete photos from their own request ONLY while in 'Pending' workflow status; admin can delete any
create policy "Sell Photos Customer Delete"
  on storage.objects for delete
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
      or is_admin()
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 5. CUSTOMER INVOICES (STRICTLY PRIVATE PURCHASE BILLS & WARRANTY PROOFS)
-- Object path convention: {customer_id}/{request_id}/{filename}
-- ────────────────────────────────────────────────────────────────────────────

-- Read: STRICTLY isolated. Customer A CANNOT view Customer B's invoice under any circumstance.
-- Admin can view all invoices to evaluate purchase date and warranty validity.
create policy "Invoices Strict Private Read"
  on storage.objects for select
  using (
    bucket_id = 'customer-invoices'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or is_admin()
    )
  );

-- Insert: Customers can upload invoices ONLY for real requests they own in draft/Pending/Booked status
create policy "Invoices Customer Insert"
  on storage.objects for insert
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

-- Delete: Customers can delete invoices ONLY while their request is in draft/Pending/Booked status
create policy "Invoices Customer Delete"
  on storage.objects for delete
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
      or is_admin()
    )
  );

-- Admin: full management authority over invoices
create policy "Invoices Admin All"
  on storage.objects for all
  using (bucket_id = 'customer-invoices' and is_admin())
  with check (bucket_id = 'customer-invoices' and is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- ARCHITECTURAL NOTICE ON URL & PATH HANDLING
-- ────────────────────────────────────────────────────────────────────────────
-- 1. Never store permanent public CDN URLs for 'customer-invoices' or 'sell-request-photos'.
-- 2. Store the relative storage object path in PostgreSQL:
--    Example: 'sell_request_documents.storage_path = "<customer_id>/<request_id>/invoice.pdf"'.
-- 3. In the React frontend or backend, request a short-lived signed URL when displaying:
--    const { data } = await supabase.storage
--      .from('customer-invoices')
--      .createSignedUrl(storagePath, 300); // 5-minute expiry
-- 4. In contrast, 'product-images' can safely use permanent public URLs:
--    supabase.storage.from('product-images').getPublicUrl(storagePath).data.publicUrl;
