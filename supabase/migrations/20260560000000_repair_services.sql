-- 20260560000000_repair_services.sql
-- Refactor the repair log to a SERVICE-based, parts-first model.
--
-- A repair_service is ONE shop/dealer VISIT; the repair_entries become the
-- PARTS replaced in that visit. Date, odometer, the single optional total, and
-- the receipts all live on the SERVICE now; each part carries just its identity
-- (description, category, position, part_group) and inherits its service's date
-- + odometer. Categories, set-parts/positions, freshness, attach-related links,
-- and reminders are unchanged — just keyed on parts whose date/odometer come
-- from their service.
--
-- Additive + idempotent; preserves ALL existing data: every existing part
-- becomes a single-part service (the part id is reused as the service id so the
-- 1:1 wiring — part → service, receipts → service — is trivial).

-- 1. The visit.
create table if not exists public.repair_services (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  service_date date not null default current_date,
  odometer integer,
  shop text,
  total_cost numeric(10, 2),
  notes text
);
alter table public.repair_services enable row level security;

-- 2. Parts point at their service; receipts move to the service level.
alter table public.repair_entries
  add column if not exists service_id uuid
    references public.repair_services(id) on delete cascade;
alter table public.repair_attachments
  add column if not exists service_id uuid
    references public.repair_services(id) on delete cascade;

-- 3. DATA MIGRATION — one service per existing part (reuse the part id as the
--    service id). The part's date/odometer/cost/notes seed the service.
insert into public.repair_services (id, created_at, service_date, odometer, total_cost, notes)
select e.id, e.created_at, e.service_date, e.odometer, e.cost, e.notes
from public.repair_entries e
where not exists (select 1 from public.repair_services s where s.id = e.id);

update public.repair_entries e
  set service_id = e.id
where e.service_id is null;

alter table public.repair_entries
  alter column service_id set not null;

-- 4. Repoint receipts to the service, then retire the part-level link.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'repair_attachments'
      and column_name = 'entry_id'
  ) then
    update public.repair_attachments a
      set service_id = a.entry_id
    where a.service_id is null and a.entry_id is not null;
    alter table public.repair_attachments alter column service_id set not null;
    alter table public.repair_attachments drop column entry_id;
  end if;
end $$;

-- 5. Indexes.
create index if not exists repair_entries_service_idx
  on public.repair_entries (service_id)
  where deleted_at is null;
create index if not exists repair_attachments_service_idx
  on public.repair_attachments (service_id);
