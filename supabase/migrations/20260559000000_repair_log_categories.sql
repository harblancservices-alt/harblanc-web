-- 20260559000000_repair_log_categories.sql
-- Organize the repair log under a fixed set of CATEGORIES.
--
-- Adds a `category` column to repair_entries AND repair_reminders (so reminders
-- group under the same categories), constrains it to the fixed 8-value enum,
-- and backfills existing rows from the part→category keyword map by matching
-- the description / label. The match is case-insensitive, word-boundaried
-- (Postgres `\y`), plural-tolerant (`s?`), and evaluated in the SAME precedence
-- order as categoryForText() in src/lib/dispatch/repair-log.ts — the Trailer
-- catch-all and the Preventative fluids/filters win over the part categories
-- that share words. Anything unmatched defaults to 'Other'.
--
-- Additive + idempotent (IF NOT EXISTS / DROP … IF EXISTS; backfill only
-- touches rows still at the 'Other' default).

-- 1. Columns — default 'Other' so the NOT NULL add is safe on existing rows.
alter table public.repair_entries
  add column if not exists category text not null default 'Other';
alter table public.repair_reminders
  add column if not exists category text not null default 'Other';

-- 2. Constrain to the fixed enum.
alter table public.repair_entries
  drop constraint if exists repair_entries_category_check;
alter table public.repair_entries
  add constraint repair_entries_category_check check (
    category in (
      'Steering & Suspension', 'Drivetrain', 'Engine Bay', 'Brakes',
      'Tires & Wheels', 'Preventative', 'Trailer', 'Other'
    )
  );
alter table public.repair_reminders
  drop constraint if exists repair_reminders_category_check;
alter table public.repair_reminders
  add constraint repair_reminders_category_check check (
    category in (
      'Steering & Suspension', 'Drivetrain', 'Engine Bay', 'Brakes',
      'Tires & Wheels', 'Preventative', 'Trailer', 'Other'
    )
  );

-- 3. Backfill entries from the description.
update public.repair_entries set category = case
  when description ~* '\y(trailer)s?\y' then 'Trailer'
  when description ~* '\y(engine oil|oil filter|fuel filter|air filter|transmission fluid|diff fluid|differential fluid|coolant flush|grease|greasing|def)s?\y' then 'Preventative'
  when description ~* '\y(brake pad|brake line|shoe|rotor|drum|caliper|abs|slack adjuster|air brake)s?\y' then 'Brakes'
  when description ~* '\y(wheel bearing|ball joint|upper control arm|lower control arm|control arm|track bar|sway bar|tie rod|drag link|pitman arm|idler arm|coil spring|leaf spring|kingpin|alignment|bushing|shock|damper|links)s?\y' then 'Steering & Suspension'
  when description ~* '\y(u-joint|u joint|driveshaft|carrier bearing|differential|diff|axle shaft|cv axle|transfer case|transmission|clutch)s?\y' then 'Drivetrain'
  when description ~* '\y(radiator|water pump|thermostat|coolant line|intercooler|boost line|fuel line|serpentine belt|tensioner|alternator|starter|battery|fuse|wiring|turbo|injector|valve lash|egr|hose)s?\y' then 'Engine Bay'
  when description ~* '\y(tire|wheel|tpms|rotation|balance)s?\y' then 'Tires & Wheels'
  else 'Other'
end
where category = 'Other';

-- 4. Backfill reminders from the label (same map).
update public.repair_reminders set category = case
  when label ~* '\y(trailer)s?\y' then 'Trailer'
  when label ~* '\y(engine oil|oil filter|fuel filter|air filter|transmission fluid|diff fluid|differential fluid|coolant flush|grease|greasing|def)s?\y' then 'Preventative'
  when label ~* '\y(brake pad|brake line|shoe|rotor|drum|caliper|abs|slack adjuster|air brake)s?\y' then 'Brakes'
  when label ~* '\y(wheel bearing|ball joint|upper control arm|lower control arm|control arm|track bar|sway bar|tie rod|drag link|pitman arm|idler arm|coil spring|leaf spring|kingpin|alignment|bushing|shock|damper|links)s?\y' then 'Steering & Suspension'
  when label ~* '\y(u-joint|u joint|driveshaft|carrier bearing|differential|diff|axle shaft|cv axle|transfer case|transmission|clutch)s?\y' then 'Drivetrain'
  when label ~* '\y(radiator|water pump|thermostat|coolant line|intercooler|boost line|fuel line|serpentine belt|tensioner|alternator|starter|battery|fuse|wiring|turbo|injector|valve lash|egr|hose)s?\y' then 'Engine Bay'
  when label ~* '\y(tire|wheel|tpms|rotation|balance)s?\y' then 'Tires & Wheels'
  else 'Other'
end
where category = 'Other';

-- 5. Category filter indexes.
create index if not exists repair_entries_category_idx
  on public.repair_entries (category)
  where deleted_at is null;
create index if not exists repair_reminders_category_idx
  on public.repair_reminders (category)
  where dismissed_at is null;
