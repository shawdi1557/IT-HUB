-- 20261031000003 publishes the Intel Partner Alliance certificate, with a placeholder image. It was
-- later unpublished by hand, and the storefront tests expect that, but only migrations build a new
-- project, so a rebuild would have publicly claimed the partnership again.
update public.partner_certificates
set is_published = false
where id = 'cert-intel';
