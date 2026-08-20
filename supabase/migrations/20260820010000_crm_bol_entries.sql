-- 20260820010000_crm_bol_entries.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CRM "BOL Center" (/crm/admin/bol-center) — a researched-BOL-profile funnel:
-- a bill of lading Brent has already worked (photo/paperwork reviewed,
-- shipper/consignee/route captured), tracked through a research→approval
-- workflow before release. Mirrors crm_otr_entries' conventions exactly
-- (same status funnel, same released_* triple, same RLS/trigger/index shape)
-- but keyed to BOL fields (shipper/consignee/commodity/dates) instead of a
-- prospective company — see src/app/crm/(authed)/admin/bol-center/** and
-- the crm_otr_entries migration's header comment for the sibling pattern.
--
-- NOT YET APPLIED TO PROD — this file is committed so the schema is tracked,
-- but per this repo's "no schema without asking" convention it must be
-- applied by hand (Supabase SQL editor / CLI) before the code that reads/
-- writes this table is relied on. Seed rows are intentionally NOT embedded in
-- this migration (unlike crm_otr_entries) — they're handed over as separate
-- INSERT statements to be reviewed and applied alongside this file.
--
-- Idempotent throughout: create table if not exists, drop policy if exists,
-- matching every prior CRM migration's convention.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.crm_bol_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  bol_number text,
  carrier text,
  shipper_name text,
  shipper_address text,
  consignee_name text,
  consignee_address text,
  bill_to text,
  commodity text,
  weight text,
  pickup_date text,
  delivery_date text,
  reference text,
  notes text,
  status text not null default 'new',
  requested_by_user_id uuid references public.crm_profiles(id) on delete set null,
  released_account_id uuid references public.crm_accounts(id) on delete set null,
  released_at timestamptz,
  released_by_user_id uuid references public.crm_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_bol_entries_status_check'
  ) then
    alter table public.crm_bol_entries
      add constraint crm_bol_entries_status_check
      check (status in ('new', 'researching', 'ready_for_approval', 'released', 'rejected'));
  end if;
end;
$$;

create index if not exists crm_bol_entries_org_idx on public.crm_bol_entries (org_id, created_at desc);

alter table public.crm_bol_entries enable row level security;

drop trigger if exists crm_bol_entries_set_updated_at on public.crm_bol_entries;
create trigger crm_bol_entries_set_updated_at before update on public.crm_bol_entries
  for each row execute function public.crm_set_updated_at();

drop policy if exists crm_bol_entries_rw on public.crm_bol_entries;
create policy crm_bol_entries_rw on public.crm_bol_entries
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());
