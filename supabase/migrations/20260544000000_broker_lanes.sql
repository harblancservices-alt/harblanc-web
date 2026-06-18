-- 20260544000000_broker_lanes.sql
-- Posted lanes captured from load boards: brokers + the lanes they advertise,
-- kept separate from booked loads so they never touch P&L or the load board.
-- Feeds Backhaul (origin within radius) so a broker you've never hauled for
-- still surfaces when you're empty near a lane they post.

create table if not exists public.broker_lanes (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references public.brokers(id) on delete cascade,
  origin_zip text,
  origin_city text,
  origin_state text,
  dest_zip text,
  dest_city text,
  dest_state text,
  rate numeric(12, 2),
  source text not null default 'load_board',
  notes text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Service-role only (admin server actions); RLS on with no policy = deny all
-- to anon/auth, matching brokers / broker_contacts / loads.
alter table public.broker_lanes enable row level security;

create index if not exists broker_lanes_broker_id_idx
  on public.broker_lanes (broker_id) where deleted_at is null;
create index if not exists broker_lanes_origin_zip_idx
  on public.broker_lanes (origin_zip) where deleted_at is null;
