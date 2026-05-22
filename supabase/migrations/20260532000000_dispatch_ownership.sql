-- 20260532000000_dispatch_ownership.sql
-- Phase 5D — Dispatch ownership placeholders.
--
-- Lightweight free-text fields that capture who's responsible for
-- moving each load. NOT a full driver / asset assignment system —
-- those land later. For now Brent (the sole dispatcher) types in
-- whatever shorthand he uses and we surface it on the ops home and
-- the lead detail.
--
-- All four are nullable text. The migration is intentionally tiny
-- so it can ship behind the operational hardening pass without
-- requiring backfill or schema coordination.

alter table public.quote_requests
  add column if not exists assigned_dispatcher text,
  add column if not exists assigned_carrier text,
  add column if not exists assigned_truck text,
  add column if not exists trailer_type text;

-- Index supports filtering active leads by carrier on the ops home
-- once that feature lands. Cheap to add now; queryable later.
create index if not exists quote_requests_assigned_carrier_idx
  on public.quote_requests (assigned_carrier)
  where deleted_at is null and assigned_carrier is not null;
