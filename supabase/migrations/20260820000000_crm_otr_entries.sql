-- 20260820000000_crm_otr_entries.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CRM "OTR" (/crm/admin/otr) — crm-design's second, document-less prospect-
-- intake funnel: a company Brent names to the assistant over the phone, with
-- no BOL/scan at all, researched straight into a real Company only once an
-- admin explicitly releases it. Kept deliberately smaller than a full
-- BOL-Center-style table (no extraction fields, no contacts, no document
-- viewer) — see DESIGN_DECISIONS.md §12 and src/app/crm-design/_lib/types.ts's
-- OtrEntry.
--
-- NOT YET APPLIED TO PROD — this file is committed so the schema is tracked,
-- but per this repo's "no schema without asking" convention it must be
-- applied by hand (Supabase SQL editor / CLI) before the code that reads/
-- writes this table is relied on. src/app/crm/(authed)/admin/otr/** is built
-- against this shape.
--
-- Release: releasing an entry (admin/otr/actions.ts's releaseOtrEntry) is the
-- ONLY path that creates a real crm_accounts row from an OTR entry — mirrors
-- crm/accounts/actions.ts's createAccount() exactly (org_id from the session,
-- lifecycle_status='lead', logs a crm_activities row) rather than duplicating
-- separate account-creation logic. released_account_id/released_at/
-- released_by_user_id are set in that same action, never touched anywhere
-- else, so "released" always means "a real company now exists for this."
--
-- Seed: Wisenbaker Builder Services — the real company Brent dispatched
-- verbally (Houston, TX interior-finish supplier/installer to TX
-- homebuilders; cabinets/countertops/flooring/window coverings/sinks; Houston
-- locations 1703 Westfield Loop Rd and 10110 W Sam Houston Pkwy N; also
-- Austin/Coppell/San Antonio offices; source: linkedin.com/company/
-- wisenbaker-builder-services) — previously flagged in REBUILD_STATUS.md as
-- "not yet seeded anywhere, since there is no real data home to seed it
-- into." This migration is that data home. Idempotent (guarded by a
-- not-exists check on company_name), single-org-safe (picks the first
-- crm_orgs row — this CRM has exactly one tenant today).
--
-- Idempotent throughout: create table if not exists, drop policy if exists,
-- matching every prior CRM migration's convention.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.crm_otr_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  company_name text not null,
  city text,
  state text,
  industry text,
  notes text,
  sales_relevance text,
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
    select 1 from pg_constraint where conname = 'crm_otr_entries_status_check'
  ) then
    alter table public.crm_otr_entries
      add constraint crm_otr_entries_status_check
      check (status in ('new', 'researching', 'ready_for_approval', 'released', 'rejected'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'crm_otr_entries_sales_relevance_check'
  ) then
    alter table public.crm_otr_entries
      add constraint crm_otr_entries_sales_relevance_check
      check (sales_relevance is null or sales_relevance in ('high', 'medium', 'low'));
  end if;
end;
$$;

create index if not exists crm_otr_entries_org_idx on public.crm_otr_entries (org_id, created_at desc);

alter table public.crm_otr_entries enable row level security;

drop trigger if exists crm_otr_entries_set_updated_at on public.crm_otr_entries;
create trigger crm_otr_entries_set_updated_at before update on public.crm_otr_entries
  for each row execute function public.crm_set_updated_at();

drop policy if exists crm_otr_entries_rw on public.crm_otr_entries;
create policy crm_otr_entries_rw on public.crm_otr_entries
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

-- ── Seed: Wisenbaker Builder Services ───────────────────────────────────────
insert into public.crm_otr_entries (org_id, company_name, city, state, industry, notes, status)
select
  o.id,
  'Wisenbaker Builder Services',
  'Houston',
  'TX',
  'Interior-finish supplier/installer to TX homebuilders',
  'Dispatched by Brent over the phone. Cabinets, countertops, flooring, window coverings, sinks. Houston locations: 1703 Westfield Loop Rd and 10110 W Sam Houston Pkwy N. Also has Austin, Coppell, and San Antonio offices. Source: linkedin.com/company/wisenbaker-builder-services',
  'new'
from public.crm_orgs o
where not exists (
  select 1 from public.crm_otr_entries e
  where e.company_name = 'Wisenbaker Builder Services' and e.deleted_at is null
)
order by o.created_at asc
limit 1;
