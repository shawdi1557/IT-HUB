-- Owner decision R3 (12 November 2026): restrict the October hardware registry tables.
--
-- hardware_products, hardware_variants and hardware_spec_audit_log (20261026000001) were replaced by the Hardware
-- Specification Manager (20261112000001). Nothing at runtime reads them: the storefront loader has no callers, no
-- database function or view uses them, and the quotation server never did. Their rows are kept, unchanged.
--
--   - Visitors (anon) can no longer read hardware_products or hardware_variants.
--   - Signed-in users (authenticated) can no longer insert, update or delete any of the three. Their existing row
--     policies stay, but without the table privilege they can't be used to write.
--   - Reading is unchanged for signed-in users: administrators still read every row (the "… or is_admin()" policies),
--     and other signed-in users still read the rows the October policies allow.
--   - The service role and the database owner are unchanged.
--
-- No table, row, policy or function is dropped. Rollback: grant the same privileges back.

revoke select on public.hardware_products, public.hardware_variants from anon;

revoke insert, update, delete on
  public.hardware_products,
  public.hardware_variants,
  public.hardware_spec_audit_log
  from authenticated;
