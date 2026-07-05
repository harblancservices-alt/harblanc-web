-- 20260557000000_repair_log.sql
-- NEW "repair log" maintenance model — replaces the interval/ticket model
-- (maintenance_items + maintenance_log + maintenance_expenses). This file is
-- ADDITIVE: it creates the new repair_* tables only. The legacy maintenance_*
-- tables are LEFT IN PLACE untouched; the follow-up data migration
-- (20260558000000_repair_log_migrate_data.sql) copies their data across, and
-- the app then reads/writes the repair_* tables exclusively.
--
-- Model:
--   repair_entries     — the one flat, chronological, searchable log. One row
--                        per repair. Optional position (set-part corner) +
--                        part_group (ties it to a reminder and/or a set).
--   repair_reminders   — recurring-maintenance overlay keyed by part_group. A
--                        reminder is just a recurrence rule; its "history" IS
--                        the repair_entries sharing its part_group. anchor_* is
--                        a manual baseline used only when no entry exists yet.
--   repair_attachments — receipts (photo/PDF) on an entry. Same private
--                        `maintenance-receipts` bucket + signed-URL pattern as
--                        the legacy attachments (bucket is reused, not remade).
--   repair_links       — soft, bidirectional "related repair" links. One row
--                        per unordered pair, queried from either side.
--
-- Service-role only (admin server actions); RLS on with no policy = deny all to
-- anon/auth, matching loads / brokers / the legacy maintenance tables.

-- --------------------------------------------------------------------------
-- Legacy-schema record (drift guard). maintenance_expenses and
-- maintenance_attachments.expense_id were applied on the live DB but never
-- captured in a repo migration. Recording them IF NOT EXISTS here makes the
-- data migration runnable against a fresh DB too (no-op against live).
create table if not exists public.maintenance_expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  log_id uuid not null references public.maintenance_log(id) on delete cascade,
  description text,
  amount numeric(10, 2)
);
alter table public.maintenance_attachments
  add column if not exists expense_id uuid
    references public.maintenance_expenses(id) on delete set null;

-- --------------------------------------------------------------------------
-- repair_entries — the flat log.
create table if not exists public.repair_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  description text not null,
  odometer integer,
  service_date date not null default current_date,
  cost numeric(10, 2),
  notes text,
  -- Optional set position: a corner (FL/FR/RL/RR), a side (L/R), or none (null).
  position text check (position in ('FL', 'FR', 'RL', 'RR', 'L', 'R')),
  -- Optional grouping label. Ties the entry to a reminder (recurring part) and
  -- to a "set" (positioned parts sharing this group). Null = plain one-off.
  part_group text,
  deleted_at timestamptz
);

-- repair_reminders — recurrence overlay on the flat log, keyed by part_group.
create table if not exists public.repair_reminders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  label text not null,
  part_group text not null,
  interval_miles integer not null,
  -- Manual baseline used ONLY when the part_group has no entries yet (e.g. a
  -- migrated never-serviced item). Once an entry exists, next-due derives from
  -- the group's most-recent entry odometer instead.
  anchor_odo integer,
  anchor_date date,
  dismissed_at timestamptz
);

-- repair_attachments — receipts on an entry (private bucket, signed URLs).
create table if not exists public.repair_attachments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  entry_id uuid not null references public.repair_entries(id) on delete cascade,
  file_path text not null,
  thumb_path text,
  file_name text,
  content_type text,
  size_bytes bigint
);

-- repair_links — soft bidirectional related-repair links. One row per unordered
-- pair (the app stores a_id < b_id); queried with (a_id = X or b_id = X).
create table if not exists public.repair_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  a_id uuid not null references public.repair_entries(id) on delete cascade,
  b_id uuid not null references public.repair_entries(id) on delete cascade,
  constraint repair_links_distinct check (a_id <> b_id),
  constraint repair_links_pair_unique unique (a_id, b_id)
);

alter table public.repair_entries enable row level security;
alter table public.repair_reminders enable row level security;
alter table public.repair_attachments enable row level security;
alter table public.repair_links enable row level security;

create index if not exists repair_entries_date_idx
  on public.repair_entries (service_date desc, created_at desc)
  where deleted_at is null;
create index if not exists repair_entries_group_idx
  on public.repair_entries (part_group)
  where deleted_at is null;
create index if not exists repair_reminders_group_idx
  on public.repair_reminders (part_group)
  where dismissed_at is null;
create index if not exists repair_attachments_entry_idx
  on public.repair_attachments (entry_id);
create index if not exists repair_links_a_idx on public.repair_links (a_id);
create index if not exists repair_links_b_idx on public.repair_links (b_id);
