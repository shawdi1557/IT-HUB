-- PC Builder Stage 3 Phase 4 (P4-5): a motherboard field saying whether its M.2 slots take M.2 SATA drives.
--
-- Additive: one row in the Hardware Registry's field catalogue, last in the motherboard list so no other field's order
-- changes. It matches src/lib/builder/hardware-spec.ts (checked by tests S4B-3 and S4B-DB-1). Optional; read only when
-- an M.2 SATA drive is chosen: yes passes, no is incompatible, unstated keeps the review notice. No Shopify metafield
-- mapping yet: its definition must first be created in Shopify, which needs Admin write access.

insert into public.hardware_spec_fields (
  category_id, key, label, value_type, unit, min_value, max_value, choices, max_length, pattern, required,
  inheritable, metafield_key, sort_order
) values
  ('Motherboard', 'm2_sata_support', 'M.2 slots accept SATA drives', 'boolean', null, null, null, null, null, null, false, false, null, 150);
