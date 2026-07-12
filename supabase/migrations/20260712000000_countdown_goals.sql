-- 20260712000000_countdown_goals.sql
-- Editable countdown goals for the Dashboard "countdown" widget. Each row is a
-- financial target with a deadline; the dashboard renders one square card per
-- goal (days-left) and a live, read-only pace breakdown computed from the
-- canonical load-net math (loadDiesel/loadNet). Owner-editable label / subtitle
-- / amount / date, plus add & remove.
--
-- Single-operator app, so no per-user scoping — one shared set the owner edits.
-- Service-role only (admin server actions); RLS on with no policy = deny all to
-- anon/auth, matching brokers / loads / email_presets. IF NOT EXISTS + a
-- seed-once guard keep this idempotent (the remote DB is applied separately).

create table if not exists public.countdown_goals (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  subtitle text not null default '',
  target_amount numeric(12, 2) not null default 0,
  target_date date not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.countdown_goals enable row level security;

create index if not exists countdown_goals_sort_idx
  on public.countdown_goals (sort_order, created_at)
  where deleted_at is null;

-- Seed the two starter goals once. No-op if any goal already exists, so
-- re-running never duplicates and never clobbers Brent's edits.
insert into public.countdown_goals (label, subtitle, target_amount, target_date, sort_order)
select v.label, v.subtitle, v.target_amount, v.target_date::date, v.sort_order
from (
  values
    ('Transmission', 'Promo payoff · beat the predatory rate', 2728.30, '2026-09-08', 0),
    ('Insurance', 'Down payment', 5000, '2026-09-21', 1)
) as v(label, subtitle, target_amount, target_date, sort_order)
where not exists (select 1 from public.countdown_goals);
