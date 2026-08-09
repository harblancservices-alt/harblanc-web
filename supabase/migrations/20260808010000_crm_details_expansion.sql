-- 20260808010000_crm_details_expansion.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CRM Details tab expansion + AI-suggestion confirm-to-fill flow.
--
-- NOT YET APPLIED TO PROD — this file is committed so the schema is tracked,
-- but per the "no schema without asking" rule it must be applied by hand
-- (Supabase MCP) before the code that reads/writes these columns deploys.
--
-- Three pieces:
--   1. New crm_accounts columns for the expanded Details record (company
--      firmographics, freight profile, commercial terms, context notes) plus
--      one lightweight jsonb marker (ai_confirmed_fields) for the "from
--      research" badge.
--   2. crm_account_locations — repeatable facilities (Locations & docks),
--      structured the same way crm_contacts hangs off crm_accounts.
--   3. crm_ai_suggestions — PENDING AI-proposed field values, kept fully
--      separate from the confirmed crm_accounts columns. AI never writes a
--      Details field directly; a rep confirms/edits/dismisses each row and
--      only a confirm writes it into crm_accounts. See
--      accounts/[id]/details-fields.ts for the field_key vocabulary this
--      table's field_key column is drawn from.
--
-- Idempotent (add column if not exists / create table if not exists / drop
-- policy if exists), matching the foundation migration's convention.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── crm_accounts: Details expansion columns ─────────────────────────────────

-- Company
alter table public.crm_accounts add column if not exists dba text;
alter table public.crm_accounts add column if not exists linkedin_url text;
alter table public.crm_accounts add column if not exists year_founded smallint;
alter table public.crm_accounts add column if not exists ownership_type text;

-- Freight profile (commodities + commodity photos already exist/are handled
-- elsewhere — crm_accounts.commodities and crm_documents kind='commodity_photo')
alter table public.crm_accounts add column if not exists equipment_needed text[] not null default '{}'::text[];
alter table public.crm_accounts add column if not exists lanes jsonb not null default '[]'::jsonb;
alter table public.crm_accounts add column if not exists volume_frequency text;
alter table public.crm_accounts add column if not exists weight_range text;
alter table public.crm_accounts add column if not exists special_requirements text[] not null default '{}'::text[];

-- Commercial (lifecycle_status, source, assigned_user_id, annual_freight_spend
-- already exist; current_carrier already exists and is reused as "incumbent
-- carrier / competitor")
alter table public.crm_accounts add column if not exists fit_rating smallint;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_accounts_fit_rating_range'
  ) then
    alter table public.crm_accounts
      add constraint crm_accounts_fit_rating_range check (fit_rating is null or fit_rating between 1 and 5);
  end if;
end;
$$;
alter table public.crm_accounts add column if not exists payment_terms text;

-- Context
alter table public.crm_accounts add column if not exists context_notes text;

-- "From research" marker — a small jsonb map of field_key -> {at, source},
-- stamped best-effort when a rep confirms an AI suggestion. Not relied on for
-- anything but a light UI badge, so it stays schemaless rather than earning
-- its own table.
alter table public.crm_accounts add column if not exists ai_confirmed_fields jsonb not null default '{}'::jsonb;

-- ── crm_account_locations (Locations & docks) ───────────────────────────────
create table if not exists public.crm_account_locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  account_id uuid not null references public.crm_accounts(id) on delete cascade,
  label text,
  address text,
  city text,
  state text,
  zip text,
  receiving_hours text,
  dock_notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists crm_account_locations_org_idx on public.crm_account_locations (org_id);
create index if not exists crm_account_locations_account_idx on public.crm_account_locations (account_id, sort_order);

alter table public.crm_account_locations enable row level security;

drop trigger if exists crm_account_locations_set_updated_at on public.crm_account_locations;
create trigger crm_account_locations_set_updated_at before update on public.crm_account_locations
  for each row execute function public.crm_set_updated_at();

drop policy if exists crm_account_locations_rw on public.crm_account_locations;
create policy crm_account_locations_rw on public.crm_account_locations
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

-- ── crm_ai_suggestions (pending AI field suggestions) ────────────────────────
create table if not exists public.crm_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  account_id uuid not null references public.crm_accounts(id) on delete cascade,
  field_key text not null,
  suggested_value jsonb not null,
  status text not null default 'pending',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.crm_profiles(id) on delete set null
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_ai_suggestions_status_check'
  ) then
    alter table public.crm_ai_suggestions
      add constraint crm_ai_suggestions_status_check check (status in ('pending', 'confirmed', 'dismissed'));
  end if;
end;
$$;

create index if not exists crm_ai_suggestions_org_idx on public.crm_ai_suggestions (org_id);
create index if not exists crm_ai_suggestions_account_idx on public.crm_ai_suggestions (account_id, status);

-- One pending suggestion per (account, field) at a time — re-running the AI
-- mapper upserts onto this rather than piling up duplicate pending rows.
create unique index if not exists crm_ai_suggestions_pending_field_uidx
  on public.crm_ai_suggestions (account_id, field_key)
  where status = 'pending';

alter table public.crm_ai_suggestions enable row level security;

drop trigger if exists crm_ai_suggestions_set_updated_at on public.crm_ai_suggestions;
create trigger crm_ai_suggestions_set_updated_at before update on public.crm_ai_suggestions
  for each row execute function public.crm_set_updated_at();

drop policy if exists crm_ai_suggestions_rw on public.crm_ai_suggestions;
create policy crm_ai_suggestions_rw on public.crm_ai_suggestions
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());
