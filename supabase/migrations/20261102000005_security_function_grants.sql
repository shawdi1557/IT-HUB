-- Least-privilege function grants, as an explicit allowlist.
--
-- Supabase's default privileges granted EXECUTE on every new function to anon and authenticated,
-- so "revoke ... from public" never removed them. From here on, a new function is callable only
-- when a migration grants it. test-env/regression/function-grants.test.ts holds the same list and
-- fails if the database drifts from it.

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

revoke execute on all functions in schema public from public, anon, authenticated, service_role;

-- Called from RLS policies, so every role that queries a table needs them. They answer only about
-- the caller, and never return NULL.
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_staff() to anon, authenticated, service_role;
grant execute on function public.can_manage_services() to anon, authenticated, service_role;
grant execute on function public.can_manage_quotations() to anon, authenticated, service_role;
grant execute on function public.can_manage_staff() to anon, authenticated, service_role;
grant execute on function public.get_current_staff_role() to anon, authenticated, service_role;

-- Public storefront features. Tracking also requires ownership, a staff role or the guest token.
grant execute on function public.health_check() to anon, authenticated, service_role;
grant execute on function public.check_onsite_warranty(text) to anon, authenticated, service_role;
grant execute on function public.validate_coupon(text, numeric) to anon, authenticated, service_role;
grant execute on function public.get_service_request_tracking(text, text) to anon, authenticated, service_role;
grant execute on function public.log_visitor_event(uuid, text, text, text, jsonb, text, text, text, text, text, text, text, text, boolean) to anon, authenticated, service_role;

-- Signed-in customers. Each checks ownership against auth.uid().
grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.create_checkout_association() to authenticated;
grant execute on function public.create_order(jsonb, uuid, text, text, text, text) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.create_service_booking(text, text, text, text, date, text, text, jsonb, text, text) to authenticated;
grant execute on function public.customer_cancel_service_request(uuid) to authenticated;
grant execute on function public.customer_request_appointment_reschedule(uuid, date, text, text) to authenticated;
grant execute on function public.record_service_pay_at_store_selection(uuid, text) to authenticated;
grant execute on function public.submit_customer_quote_decision(uuid, text, text[], integer, text) to authenticated;

-- Staff. Each checks the role and audits the verified caller.
grant execute on function public.get_staff_portal_profile() to authenticated;
grant execute on function public.generate_customer_audit_reference() to authenticated, service_role;
grant execute on function public.staff_update_service_status(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.staff_update_status_description(uuid, text, text) to authenticated;
grant execute on function public.staff_confirm_service_payment_collected(uuid, numeric, text, text) to authenticated;
grant execute on function public.staff_save_service_billing(uuid, jsonb, boolean) to authenticated;
grant execute on function public.staff_decide_appointment_reschedule(uuid, text, text, uuid) to authenticated;
grant execute on function public.staff_update_pc_quotation_status(uuid, text, text, uuid) to authenticated;
grant execute on function public.staff_delete_review(uuid) to authenticated;
grant execute on function public.staff_update_review_status(uuid, text) to authenticated;
grant execute on function public.staff_update_sell_request(uuid, text, text, numeric) to authenticated;

-- Server only: Edge Functions and scheduled maintenance.
grant execute on function public.validate_and_consume_association_token(text, text) to service_role;
grant execute on function public.check_distributed_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.submit_pc_quotation_request(text, text, jsonb, numeric, jsonb, text, text, text) to service_role;
grant execute on function public.attach_service_razorpay_order_id(uuid, text) to service_role;
grant execute on function public.record_service_payment(uuid, text, text, text, numeric, text) to service_role;
grant execute on function public.attach_razorpay_order_id(uuid, text) to service_role;
grant execute on function public.record_order_payment(uuid, text, text, text, numeric, text) to service_role;
grant execute on function public.record_payment_failure(uuid, text) to service_role;
grant execute on function public.cleanup_expired_orders() to service_role;
grant execute on function public.purge_visitor_data() to service_role;
grant execute on function public.bootstrap_first_admin(uuid) to service_role;

-- Everything else (trigger functions, validate_service_booking, generate_ticket_reference,
-- mask_ip_address) runs only inside other functions and has no direct grant.
