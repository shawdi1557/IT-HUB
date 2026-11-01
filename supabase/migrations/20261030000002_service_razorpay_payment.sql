-- ============================================================================
-- IT HUB — Service Quotation Razorpay & Showroom Payment Integration
-- Migration: 20261030000002_service_razorpay_payment.sql
-- Description: Adds dedicated payment columns to public.service_requests,
-- attach_service_razorpay_order_id, record_service_payment (idempotent,
-- signature-verified, amount-bound), record_service_pay_at_store_selection,
-- and staff_confirm_service_payment_collected RPCs.
-- ============================================================================

begin;

-- 1. Add dedicated payment columns to public.service_requests
alter table public.service_requests
  add column if not exists payment_status text not null default 'Unpaid'
    check (payment_status in ('Unpaid', 'Pending', 'Pay at Store', 'Paid', 'Failed', 'Refunded')),
  add column if not exists payment_method text
    check (payment_method is null or payment_method in ('upi', 'store')),
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists paid_amount numeric(12, 2)
    check (paid_amount is null or paid_amount >= 0),
  add column if not exists payment_collected_by uuid references public.profiles (id) on delete set null;

-- 2. Indexes for idempotency and fast payment lookups
create index if not exists service_requests_rzp_order_idx
  on public.service_requests (razorpay_order_id)
  where razorpay_order_id is not null;

create index if not exists service_requests_rzp_payment_idx
  on public.service_requests (razorpay_payment_id)
  where razorpay_payment_id is not null;

create index if not exists service_requests_payment_status_idx
  on public.service_requests (payment_status);

-- 3. RPC: attach_service_razorpay_order_id
-- Invoked securely by Edge Function (service_role) upon creating order on Razorpay
create or replace function public.attach_service_razorpay_order_id(
  p_service_request_id uuid,
  p_razorpay_order_id text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req record;
begin
  if p_service_request_id is null then
    raise exception 'service_request_id is required';
  end if;

  if p_razorpay_order_id is null or trim(p_razorpay_order_id) = '' then
    raise exception 'razorpay_order_id is required';
  end if;

  select * into v_req
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception 'Service request not found for id: %', p_service_request_id;
  end if;

  if v_req.payment_status = 'Paid' then
    raise exception 'Service request % is already marked as Paid', p_service_request_id;
  end if;

  update public.service_requests
  set
    razorpay_order_id = trim(p_razorpay_order_id),
    payment_method = 'upi',
    payment_status = case when payment_status = 'Unpaid' then 'Pending' else payment_status end,
    updated_at = now()
  where id = p_service_request_id;

  return jsonb_build_object(
    'ok', true,
    'service_id', p_service_request_id,
    'razorpay_order_id', trim(p_razorpay_order_id)
  );
end;
$$;

revoke all on function public.attach_service_razorpay_order_id(uuid, text) from public, anon, authenticated;
grant execute on function public.attach_service_razorpay_order_id(uuid, text) to service_role;

-- 4. RPC: record_service_payment
-- Invoked securely by Edge Function (service_role) upon timing-safe signature verification
create or replace function public.record_service_payment(
  p_service_request_id uuid,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_razorpay_signature text,
  p_amount_paid numeric,
  p_currency text default 'INR'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req record;
  v_new_status text;
  v_billing jsonb;
begin
  if p_service_request_id is null then
    raise exception 'service_request_id is required';
  end if;

  if p_razorpay_order_id is null or trim(p_razorpay_order_id) = '' then
    raise exception 'razorpay_order_id is required';
  end if;

  if p_razorpay_payment_id is null or trim(p_razorpay_payment_id) = '' then
    raise exception 'razorpay_payment_id is required';
  end if;

  if p_amount_paid is null or p_amount_paid <= 0 then
    raise exception 'amount_paid is required and must be greater than zero';
  end if;

  if p_currency is null or upper(trim(p_currency)) <> 'INR' then
    raise exception 'Invalid currency: %, only INR is supported', p_currency;
  end if;

  select * into v_req
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception 'Service request not found for id: %', p_service_request_id;
  end if;

  -- Verify attached order ID
  if v_req.razorpay_order_id is null or trim(v_req.razorpay_order_id) = '' then
    raise exception 'Service ticket % does not have an attached Razorpay order ID', v_req.id;
  end if;

  if v_req.razorpay_order_id <> trim(p_razorpay_order_id) then
    raise exception 'Razorpay order ID mismatch: Expected %, Received %',
      v_req.razorpay_order_id, trim(p_razorpay_order_id);
  end if;

  -- Idempotency check: Duplicate callbacks with identical payment ID return 200 safely
  if v_req.payment_status = 'Paid' then
    if v_req.razorpay_payment_id = trim(p_razorpay_payment_id) then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'service_id', v_req.id,
        'ticket_reference', coalesce(v_req.ticket_reference, v_req.id::text),
        'payment_status', 'Paid',
        'status', v_req.status
      );
    else
      raise exception 'Service ticket % is already marked as Paid with different payment ID %',
        v_req.id, v_req.razorpay_payment_id;
    end if;
  end if;

  -- Validate exact amount match against approved quote in database
  if round(p_amount_paid, 2) <> round(coalesce(v_req.quote, 0), 2) then
    raise exception 'Payment amount mismatch: Expected ₹%, Received ₹%', v_req.quote, p_amount_paid;
  end if;

  -- Determine appropriate workflow status transition
  v_new_status := v_req.status;
  if v_req.status in ('Awaiting Approval', 'Diagnosis Done', 'Booked', 'Device Received') then
    v_new_status := 'In Progress';
  end if;

  -- Build updated billing details JSON
  v_billing := coalesce(v_req.billing_details, '{}'::jsonb) || jsonb_build_object(
    'paymentMethod', 'UPI',
    'paymentStatus', 'Received',
    'razorpayOrderId', trim(p_razorpay_order_id),
    'razorpayPaymentId', trim(p_razorpay_payment_id),
    'paidAt', now(),
    'paidAmount', p_amount_paid
  );

  update public.service_requests
  set
    payment_status = 'Paid',
    payment_method = 'upi',
    razorpay_payment_id = trim(p_razorpay_payment_id),
    paid_at = now(),
    paid_amount = p_amount_paid,
    status = v_new_status,
    billing_details = v_billing,
    notes = coalesce(notes, '') || case
      when coalesce(notes, '') = '' then ''
      else E'\n'
    end || '[Razorpay UPI Payment ID: ' || trim(p_razorpay_payment_id) || ' | Amount: ₹' || p_amount_paid || ' | Status: Paid]',
    updated_at = now()
  where id = p_service_request_id;

  return jsonb_build_object(
    'ok', true,
    'service_id', v_req.id,
    'ticket_reference', coalesce(v_req.ticket_reference, v_req.id::text),
    'payment_status', 'Paid',
    'status', v_new_status,
    'paid_amount', p_amount_paid
  );
end;
$$;

revoke all on function public.record_service_payment(uuid, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.record_service_payment(uuid, text, text, text, numeric, text) to service_role;

-- 5. RPC: record_service_pay_at_store_selection
-- Invoked by customer selecting offline Showroom pickup settlement
create or replace function public.record_service_pay_at_store_selection(
  p_service_request_id uuid,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req record;
  v_billing jsonb;
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized: Authentication required';
  end if;

  select * into v_req
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception 'Service request not found';
  end if;

  if v_req.user_id <> auth.uid() and not is_admin() then
    raise exception 'Unauthorized: You do not own this service ticket';
  end if;

  if v_req.payment_status = 'Paid' then
    raise exception 'Service ticket is already marked as Paid';
  end if;

  v_new_status := v_req.status;
  if v_req.status in ('Awaiting Approval', 'Diagnosis Done') then
    v_new_status := 'In Progress';
  end if;

  v_billing := coalesce(v_req.billing_details, '{}'::jsonb) || jsonb_build_object(
    'paymentMethod', 'Pay at Store',
    'paymentStatus', 'Pending',
    'selectedAt', now(),
    'payableAmount', v_req.quote
  );

  update public.service_requests
  set
    payment_status = 'Pay at Store',
    payment_method = 'store',
    status = v_new_status,
    billing_details = v_billing,
    notes = coalesce(notes, '') || case
      when coalesce(notes, '') = '' then ''
      else E'\n'
    end || '[Method: Pay at IT HUB Showroom | Amount: ₹' || coalesce(v_req.quote, 0) || ' | Status: Awaiting Payment at IT HUB]',
    updated_at = now()
  where id = p_service_request_id;

  return jsonb_build_object(
    'ok', true,
    'service_id', v_req.id,
    'payment_status', 'Pay at Store',
    'is_paid', false,
    'status', v_new_status
  );
end;
$$;

grant execute on function public.record_service_pay_at_store_selection(uuid, text) to authenticated;

-- 6. RPC: staff_confirm_service_payment_collected
-- Invoked by authorized staff at the counter upon receiving payment
create or replace function public.staff_confirm_service_payment_collected(
  p_service_request_id uuid,
  p_collected_amount numeric,
  p_payment_method text default 'store',
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req record;
  v_billing jsonb;
begin
  if not public.is_staff() and not is_admin() then
    raise exception 'Unauthorized: Only authorized staff can confirm payment collection';
  end if;

  if p_collected_amount is null or p_collected_amount <= 0 then
    raise exception 'collected_amount must be greater than zero';
  end if;

  select * into v_req
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception 'Service request not found';
  end if;

  v_billing := coalesce(v_req.billing_details, '{}'::jsonb) || jsonb_build_object(
    'paymentMethod', coalesce(p_payment_method, 'store'),
    'paymentStatus', 'Received',
    'collectedAmount', p_collected_amount,
    'collectedBy', auth.uid(),
    'collectedAt', now(),
    'receiptNote', p_notes
  );

  update public.service_requests
  set
    payment_status = 'Paid',
    payment_method = coalesce(p_payment_method, 'store'),
    paid_at = now(),
    paid_amount = p_collected_amount,
    payment_collected_by = auth.uid(),
    billing_details = v_billing,
    notes = coalesce(notes, '') || case
      when coalesce(notes, '') = '' then ''
      else E'\n'
    end || '[Staff Settlement: Payment of ₹' || p_collected_amount || ' verified and collected at IT HUB Showroom by staff ' || auth.uid() || ']',
    updated_at = now()
  where id = p_service_request_id;

  -- Create immutable staff audit log entry
  insert into public.staff_audit_logs (
    staff_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'SERVICE_PAYMENT_COLLECTED',
    'service_request',
    p_service_request_id,
    jsonb_build_object(
      'amount', p_collected_amount,
      'payment_method', p_payment_method,
      'notes', p_notes
    )
  );

  return jsonb_build_object(
    'ok', true,
    'service_id', v_req.id,
    'payment_status', 'Paid',
    'paid_amount', p_collected_amount
  );
end;
$$;

grant execute on function public.staff_confirm_service_payment_collected(uuid, numeric, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
