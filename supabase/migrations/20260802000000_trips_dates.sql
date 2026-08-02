-- 20260802000000_trips_dates.sql
-- Trips gain a start timestamp + optional end timestamp, replacing the
-- created_at-only date story on the Trips list/detail pages. A trip with no
-- ended_at is "Ongoing" and stays Active in the UI.
--
-- Both columns are nullable at the DB level — existing rows can't be
-- retroactively given a "real" operator-entered start time, and Postgres
-- can't backfill a NOT NULL constraint with anything more meaningful than a
-- guess. "Required" is enforced in the New/Edit Trip form instead (both
-- date+time inputs use the native `required` attribute), not by a DB
-- constraint. Existing trips are backfilled from created_at below so the
-- Dates column never shows a blank cell for a trip created before this
-- migration ran.

alter table public.trips
  add column if not exists started_at timestamptz null;
alter table public.trips
  add column if not exists ended_at timestamptz null;

update public.trips
  set started_at = created_at
  where started_at is null;
