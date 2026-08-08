-- 20260808000000_repair_entries_sub_category.sql
-- tms-v2's "Log a service" modal (Parts Replaced row) replaces the
-- axle/side "position" dropdown with a category-scoped sub-category
-- dropdown (e.g. Engine Bay -> "Engine oil & filter", "Fuel filter(s)",
-- ...; Drivetrain -> "Differential fluid", ...). "position" doesn't make
-- sense for this form and is being dropped from it; this is a distinct
-- new field, not a repurposing of `position` (which /admin's own modal
-- still writes real axle/side values into for its set/[group] view).
--
-- Additive only: existing repair_entries rows are unaffected, `position`
-- stays exactly as-is for /admin's modal.

alter table public.repair_entries
  add column if not exists sub_category text;
