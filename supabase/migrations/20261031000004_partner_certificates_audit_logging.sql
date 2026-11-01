-- ============================================================================
-- IT HUB — Staff Portal Partner Certificates Audit Logging Support
-- Migration: 20261031000004_partner_certificates_audit_logging.sql
-- ============================================================================

alter table public.staff_audit_logs
  drop constraint if exists staff_audit_logs_entity_type_check;

alter table public.staff_audit_logs
  add constraint staff_audit_logs_entity_type_check check (
    entity_type = any (array[
      'pc_quotation'::text,
      'service_request'::text,
      'staff_membership'::text,
      'store_settings'::text,
      'announcement'::text,
      'sell_request'::text,
      'review'::text,
      'partner_certificate'::text,
      'website_showcase'::text,
      'promotional_campaign'::text,
      'customer_audit'::text
    ])
  );
