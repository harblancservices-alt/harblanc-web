-- 20260545000000_maintenance.sql
-- Preventative maintenance schedule for the truck (2018 Ram 2500 6.7L
-- Cummins). The remote DB is already created + seeded; this file is a repo
-- record only and uses IF NOT EXISTS so it is a no-op against the live tables.
--
-- maintenance_items — one row per service (oil, fuel filters, …) with its
--   mileage interval and the last-service bookend.
-- maintenance_log — append-only history of services performed.
--
-- Service-role only (admin server actions); RLS on with no policy = deny all
-- to anon/auth, matching brokers / loads.

create table if not exists public.maintenance_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  interval_miles integer not null,
  last_service_odo integer,
  last_service_date date,
  notes text,
  sort_order integer not null default 0,
  deleted_at timestamptz
);

create table if not exists public.maintenance_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  item_id uuid not null references public.maintenance_items(id) on delete cascade,
  service_odo integer not null,
  service_date date not null,
  notes text
);

alter table public.maintenance_items enable row level security;
alter table public.maintenance_log enable row level security;

create index if not exists maintenance_items_sort_idx
  on public.maintenance_items (sort_order)
  where deleted_at is null;
create index if not exists maintenance_log_item_idx
  on public.maintenance_log (item_id);
