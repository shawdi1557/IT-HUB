-- Durable webhook idempotency and order versioning.
--
-- The previous de-duplication was an in-memory map, marked before processing. A retry after a
-- failed attempt was acknowledged as a duplicate and lost, and the map vanished on every restart.

create table if not exists public.shopify_webhook_deliveries (
  webhook_id text primary key,
  topic text not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed')),
  attempts integer not null default 1,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.shopify_webhook_deliveries enable row level security;
revoke all on public.shopify_webhook_deliveries from public, anon, authenticated;
grant all on public.shopify_webhook_deliveries to service_role;

-- When Shopify last changed the order. An older delivery arriving late can't overwrite a newer one.
alter table public.shopify_customer_orders
  add column if not exists shopify_updated_at timestamptz;

-- Claims a delivery atomically. Returns false only when it was already processed, or when another
-- worker claimed it within the last two minutes. A failed or stalled delivery can be claimed again.
create or replace function public.claim_shopify_webhook(p_webhook_id text, p_topic text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized: webhook deliveries are claimed only by the verified webhook.'
      using errcode = '42501';
  end if;

  insert into public.shopify_webhook_deliveries as d (webhook_id, topic)
  values (p_webhook_id, p_topic)
  on conflict (webhook_id) do update
    set status = 'processing',
        attempts = d.attempts + 1,
        received_at = now(),
        last_error = null
    where d.status = 'failed'
       or (d.status = 'processing' and d.received_at < now() - interval '2 minutes')
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.finish_shopify_webhook(
  p_webhook_id text,
  p_succeeded boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized: webhook deliveries are finished only by the verified webhook.'
      using errcode = '42501';
  end if;

  update public.shopify_webhook_deliveries
  set status = case when p_succeeded is true then 'processed' else 'failed' end,
      processed_at = case when p_succeeded is true then now() else null end,
      last_error = left(p_error, 500)
  where webhook_id = p_webhook_id;
end;
$$;

revoke execute on function public.claim_shopify_webhook(text, text) from public, anon, authenticated;
revoke execute on function public.finish_shopify_webhook(text, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_shopify_webhook(text, text) to service_role;
grant execute on function public.finish_shopify_webhook(text, boolean, text) to service_role;
