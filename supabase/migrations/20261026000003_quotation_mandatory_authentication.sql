-- ============================================================================
-- Migration: Phase 5.4 - Mandatory Customer Authentication for PC Quotations
-- Target: Supabase / PostgreSQL
-- ============================================================================

begin;

-- 1. Update protect_pc_build trigger function to strictly mandate authentication for quotation submissions.
-- Guests may browse components, calculate pricing and view compatibility results,
-- but submitting an official quotation (generating a reference_id or setting enquiry_status to 'New')
-- strictly requires an authenticated customer account.
create or replace function public.protect_pc_build() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    if tg_op = 'INSERT' then
      -- Quotation submissions (reference_id populated or status is New) strictly require an authenticated customer ID
      if (new.reference_id is not null or new.enquiry_status in ('New', 'Contacted', 'Quoted', 'Closed')) and new.user_id is null then
        raise exception 'Unauthorized: PC quotation submission requires an authenticated customer account. Please sign in.';
      end if;

      -- If authenticated, enforce user_id matches auth.uid()
      if auth.uid() is not null then
        if new.user_id is distinct from auth.uid() then
          raise exception 'Unauthorized: PC Build user_id must match authenticated user';
        end if;
      else
        -- Guest drafts cannot claim an arbitrary user_id
        if new.user_id is not null then
          raise exception 'Unauthorized: Guest PC Build requests cannot claim a user_id';
        end if;
      end if;

      if new.enquiry_status not in ('Draft', 'New') then
        raise exception 'Unauthorized: New PC build enquiry must start as Draft or New';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
        raise exception 'Unauthorized: PC Build identity and ownership are immutable';
      end if;
      if new.enquiry_status is distinct from old.enquiry_status and new.enquiry_status in ('Contacted', 'Quoted', 'Closed') then
        raise exception 'Unauthorized: Only administrators can update PC build status to %', new.enquiry_status;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- 2. Update submit_pc_quotation_request RPC defense-in-depth:
-- Require non-null authenticated user_id even if called through trusted backend pathways.
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
  if v_user_id is null and auth.role() not in ('service_role', 'postgres') and not is_admin() then
    raise exception 'Unauthorized: PC quotation submission requires an authenticated customer account.';
  end if;

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
