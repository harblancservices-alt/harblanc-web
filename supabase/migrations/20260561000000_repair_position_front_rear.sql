-- 20260561000000_repair_position_front_rear.sql
-- Add axle-level positions FRONT / REAR to repair_entries.position (alongside
-- the FL/FR/RL/RR corners and L/R sides). New enum values are 'FRONT' / 'REAR'
-- so they don't collide with the 'FR' corner. Widen the CHECK constraint.
--
-- Idempotent (DROP … IF EXISTS then re-add).

alter table public.repair_entries
  drop constraint if exists repair_entries_position_check;
alter table public.repair_entries
  add constraint repair_entries_position_check check (
    position in ('FL', 'FR', 'RL', 'RR', 'FRONT', 'REAR', 'L', 'R')
  );
