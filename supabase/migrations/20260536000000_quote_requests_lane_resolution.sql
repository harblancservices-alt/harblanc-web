-- 20260536000000_quote_requests_lane_resolution.sql
-- Phase LANE-3A — Persistent lane resolution columns on quote_requests.
--
-- This migration is INFRASTRUCTURE ONLY.
--   - No customer-facing behavior change.
--   - No application code change in this commit (LANE-3B will start reading
--     and lazily backfilling these columns).
--   - No data backfill at migration time. Existing rows keep their current
--     shape; the new columns are NULL until either (a) the lazy backfill
--     in the LANE-3B detail-page loader fills them on first render, or
--     (b) a future LANE-4 routing-API integration writes a more accurate
--     mileage value.
--   - All seven columns are nullable. Existing INSERTs and SELECTs continue
--     to work without modification (no NOT NULL, no defaults that would
--     trigger a table rewrite).
--   - All ADD COLUMN clauses are IF NOT EXISTS so the migration is safe
--     to re-run.
--   - The CHECK constraint and the index are guarded with DO-block
--     existence checks so re-running the migration on a DB that already
--     has them does not error.
--   - 'mapbox' is RESERVED in the mileage_source check constraint for the
--     future LANE-4 routing-API integration. No code path writes that
--     value in LANE-3.
--
-- Why these columns live on quote_requests:
--   - Lane (pickup ↔ delivery ZIP) is a property of the lead, not of any
--     particular estimate draft. dispatch_estimates.miles_estimate stays
--     where it is — that field is the operator's per-draft override and
--     should remain at the draft level. calculated_miles on quote_requests
--     is the SYSTEM's best knowledge of the lane miles, distinct from any
--     manual override.
--   - shipment_intake and finalized_quotes already carry their own city/
--     state/ZIP snapshots from the customer-confirmed intake address.
--     Those tables are not touched here.
--
-- Rollback safety:
--   - All operations are additive. To reverse:
--       drop index if exists public.quote_requests_last_geocoded_idx;
--       alter table public.quote_requests
--         drop constraint if exists quote_requests_mileage_source_check,
--         drop column if exists pickup_city,
--         drop column if exists pickup_state,
--         drop column if exists delivery_city,
--         drop column if exists delivery_state,
--         drop column if exists calculated_miles,
--         drop column if exists mileage_source,
--         drop column if exists last_geocoded_at;
--   - No existing row data is modified, so a rollback loses only the
--     columns themselves (no application data to recover).

-- ----- 1. Nullable column additions -----------------------------------

alter table public.quote_requests
  add column if not exists pickup_city       text,
  add column if not exists pickup_state      text,
  add column if not exists delivery_city     text,
  add column if not exists delivery_state    text,
  add column if not exists calculated_miles  integer,
  add column if not exists mileage_source    text,
  add column if not exists last_geocoded_at  timestamptz;

-- ----- 2. mileage_source check constraint -----------------------------
--
-- Constrains the provenance label to a known set so the UI can render
-- the caption confidently. 'zip_estimate' is the LANE-3B backfill source
-- (great-circle * 1.18 from the bundled zipcodes dataset). 'manual' is
-- reserved for operator-entered overrides. 'mapbox' is RESERVED for
-- LANE-4 routing-API integration and is intentionally NOT written by any
-- code path in LANE-3.
--
-- Guarded with a DO block so the migration can be re-run safely. The
-- constraint is added with NOT VALID + then validated separately, which
-- avoids a full table scan on large quote_requests tables — existing
-- rows have mileage_source IS NULL by definition of just-added columns,
-- so VALIDATE is effectively a no-op.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quote_requests_mileage_source_check'
      and conrelid = 'public.quote_requests'::regclass
  ) then
    alter table public.quote_requests
      add constraint quote_requests_mileage_source_check
        check (
          mileage_source is null
          or mileage_source in ('zip_estimate', 'mapbox', 'manual')
        )
        not valid;

    alter table public.quote_requests
      validate constraint quote_requests_mileage_source_check;
  end if;
end $$;

-- ----- 3. Partial index on last_geocoded_at ---------------------------
--
-- Sorts NULLS FIRST so a future maintenance job (or the LANE-3B lazy
-- backfill, if ever re-run as a batch sweep) can cheaply find the set
-- of leads that have never been resolved. Partial WHERE matches the
-- existing quote_requests_lead_status_idx convention — trashed rows
-- don't need geocoding and are excluded from the index footprint.

create index if not exists quote_requests_last_geocoded_idx
  on public.quote_requests (last_geocoded_at nulls first)
  where deleted_at is null;
