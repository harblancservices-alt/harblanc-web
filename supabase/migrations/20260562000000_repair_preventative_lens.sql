-- 20260562000000_repair_preventative_lens.sql
-- Rework PREVENTATIVE from a mechanical bucket into a cross-cutting green LENS.
--
-- BEFORE: 'Preventative' was one of the assignable categories; fluids, filters,
-- grease, DEF, etc. were filed there instead of a mechanical home.
-- AFTER:  the mechanical categories (Steering & Suspension, Drivetrain, Engine
-- Bay, Brakes, Tires & Wheels, Trailer, Other) are the only HOMES. An item is
-- "preventative" if it's a recurring/consumable maintenance item OR it has an
-- active mileage reminder; it keeps a mechanical home AND surfaces in the
-- aggregate Preventative lens. A new persisted `is_preventative` boolean drives
-- that aggregate + the per-category "Scheduled" sections efficiently.
--
-- This migration:
--   1. adds is_preventative to repair_entries + repair_reminders,
--   2. flags the rows currently filed under 'Preventative' (before re-homing),
--   3. re-homes those rows to a mechanical category by keyword,
--   4. also flags anything matching the consumable classifier or having an
--      active reminder,
--   5. leaves 'Preventative' ALLOWED by the CHECK constraints (legacy value,
--      no longer written) so no row can violate it.
--
-- Preserves ALL data. Idempotent (add-if-not-exists; re-home only touches rows
-- still at category='Preventative'; flag updates are set-to-true and re-runnable).

-- --------------------------------------------------------------------------
-- 1. Persisted preventative flag (default false; NOT NULL is safe on add).
alter table public.repair_entries
  add column if not exists is_preventative boolean not null default false;
alter table public.repair_reminders
  add column if not exists is_preventative boolean not null default false;

-- --------------------------------------------------------------------------
-- 2. Flag the existing Preventative-bucket rows BEFORE re-homing them — every
--    row that lived under 'Preventative' is preventative by definition.
update public.repair_entries set is_preventative = true
  where category = 'Preventative';
update public.repair_reminders set is_preventative = true
  where category = 'Preventative';

-- --------------------------------------------------------------------------
-- 3. Re-home Preventative ENTRIES to their mechanical category by keyword.
--      fluids                    -> Drivetrain
--      oil/filters/coolant/def   -> Engine Bay
--      tire rotation             -> Tires & Wheels
--      grease                    -> Steering & Suspension
--      anything else             -> Engine Bay
update public.repair_entries set category = case
  when description ~* '\y(transmission fluid|transfer case fluid|front diff fluid|rear diff fluid|differential fluid|diff fluid)s?\y' then 'Drivetrain'
  when description ~* '\y(engine oil|oil filter|fuel filter|air filter|cabin filter|coolant flush|coolant|ccv|crankcase vent|crankcase|def)s?\y' then 'Engine Bay'
  when description ~* '\y(tire rotation|rotation)s?\y' then 'Tires & Wheels'
  when description ~* '\y(grease|greasing)s?\y' then 'Steering & Suspension'
  else 'Engine Bay'
end
where category = 'Preventative';

-- 4. Re-home Preventative REMINDERS (same map, matched on the label).
update public.repair_reminders set category = case
  when label ~* '\y(transmission fluid|transfer case fluid|front diff fluid|rear diff fluid|differential fluid|diff fluid)s?\y' then 'Drivetrain'
  when label ~* '\y(engine oil|oil filter|fuel filter|air filter|cabin filter|coolant flush|coolant|ccv|crankcase vent|crankcase|def)s?\y' then 'Engine Bay'
  when label ~* '\y(tire rotation|rotation)s?\y' then 'Tires & Wheels'
  when label ~* '\y(grease|greasing)s?\y' then 'Steering & Suspension'
  else 'Engine Bay'
end
where category = 'Preventative';

-- --------------------------------------------------------------------------
-- 5. Flag consumable/classifier matches wherever they live (mirrors
--    isPreventative() in src/lib/dispatch/repair-log.ts).
update public.repair_entries set is_preventative = true
where is_preventative = false
  and description ~* '\y(engine oil|oil filter|fuel filter|air filter|cabin filter|coolant|grease|greasing|def|transmission fluid|transfer case fluid|diff fluid|differential fluid|tire rotation|rotation)s?\y';

-- 6. Every ACTIVE reminder is a preventative overlay.
update public.repair_reminders set is_preventative = true
  where dismissed_at is null;

-- 7. Any entry whose part_group has an ACTIVE reminder is preventative too
--    (case/space-insensitive group match, matching groupKey()).
update public.repair_entries e set is_preventative = true
where e.is_preventative = false
  and e.deleted_at is null
  and e.part_group is not null
  and exists (
    select 1 from public.repair_reminders r
    where r.dismissed_at is null
      and lower(btrim(r.part_group)) = lower(btrim(e.part_group))
  );

-- --------------------------------------------------------------------------
-- 8. Keep the category CHECK constraints permissive: the 7 mechanical homes
--    plus the legacy 'Preventative' value (no longer written, but allowed so no
--    stored row can violate the constraint). Re-assert idempotently.
alter table public.repair_entries
  drop constraint if exists repair_entries_category_check;
alter table public.repair_entries
  add constraint repair_entries_category_check check (
    category in (
      'Steering & Suspension', 'Drivetrain', 'Engine Bay', 'Brakes',
      'Tires & Wheels', 'Trailer', 'Other', 'Preventative'
    )
  );
alter table public.repair_reminders
  drop constraint if exists repair_reminders_category_check;
alter table public.repair_reminders
  add constraint repair_reminders_category_check check (
    category in (
      'Steering & Suspension', 'Drivetrain', 'Engine Bay', 'Brakes',
      'Tires & Wheels', 'Trailer', 'Other', 'Preventative'
    )
  );

-- --------------------------------------------------------------------------
-- 9. Partial indexes for the aggregate lens + per-category "Scheduled" queries.
create index if not exists repair_entries_preventative_idx
  on public.repair_entries (category)
  where deleted_at is null and is_preventative;
create index if not exists repair_reminders_preventative_idx
  on public.repair_reminders (category)
  where dismissed_at is null and is_preventative;
