-- Website orders belong to the signed-in customer who started the checkout.
--
-- create_checkout_association() issues a single-use token to the caller identified by the verified
-- JWT, and takes no other input. The token travels through the Shopify checkout, and the signed
-- webhook uses it to link the order. It is the only way an order reaches a customer's account.
-- Orders without a valid token, such as in-store, WhatsApp, manual or historical ones, aren't
-- website orders. They aren't linked, stored or held for later.

-- A customer can come back to an unpaid checkout days later, and a token that expired in the
-- meantime would leave a paid order unlinked with no way to recover it.
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

  v_token := 'hub_assoc_' || encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.shopify_order_associations (token, user_id, expires_at)
  values (v_token, v_uid, now() + interval '14 days');

  return v_token;
end;
$$;

-- Single-use, except that a retry for the same order gets the same answer. Shopify retries a
-- delivery that failed, and the token may have been consumed before the failure.
create or replace function public.validate_and_consume_association_token(
  p_token text,
  p_shopify_order_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assoc record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized: association tokens are consumed only by the verified webhook.'
      using errcode = '42501';
  end if;

  if p_token is null or trim(p_token) = '' or coalesce(p_shopify_order_id, '') = '' then
    return null;
  end if;

  select * into v_assoc
  from public.shopify_order_associations
  where token = trim(p_token)
  for update;

  if not found then
    return null;
  end if;

  if v_assoc.used_at is not null then
    if v_assoc.shopify_order_id = p_shopify_order_id then
      return v_assoc.user_id;
    end if;
    return null;
  end if;

  if v_assoc.expires_at <= now() then
    return null;
  end if;

  update public.shopify_order_associations
  set used_at = now(),
      shopify_order_id = p_shopify_order_id
  where id = v_assoc.id;

  return v_assoc.user_id;
end;
$$;

-- An order's owner can't be changed by anyone, including the service role. Concurrent deliveries
-- can't overwrite each other: the second write fails, and Shopify's retry finds the owner.
create or replace function public.protect_shopify_order_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'An order''s owner can''t be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists shopify_customer_orders_protect_owner on public.shopify_customer_orders;
create trigger shopify_customer_orders_protect_owner
  before update on public.shopify_customer_orders
  for each row execute function public.protect_shopify_order_owner();

revoke execute on function public.protect_shopify_order_owner() from public, anon, authenticated, service_role;
