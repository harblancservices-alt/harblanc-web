-- 20260557000000_crm_foundation.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- "Hello Hotshot" CRM — Phase 1 foundation.
--
-- A STANDALONE CRM that lives inside this app but shares NOTHING with the
-- Dispatch/admin system. Every object here is prefixed `crm_` and every row is
-- scoped to a CRM org via `org_id`. There is NO overlap with dispatch tables
-- (quote_requests, brokers, loads, reach_*, dispatch_*, profiles, etc.) and no
-- policy here ever references them.
--
-- Multi-tenant model:
--   crm_orgs        — one row per CRM tenant (Hello Hotshot is the first).
--   crm_profiles    — links a Supabase Auth user (id = auth.users.id) to ONE
--                     crm_org. Membership in this table — and ONLY this table —
--                     is what grants CRM access. A dispatch admin is NOT a CRM
--                     user unless they also have a crm_profiles row, and a CRM
--                     user gets no dispatch access from this schema.
--
-- RLS: enabled on every table, DENY BY DEFAULT. anon gets nothing. An
-- authenticated user sees only rows whose org_id equals THEIR org, resolved by
-- the SECURITY DEFINER helper crm_current_org() (which reads crm_profiles with
-- RLS bypassed, so the crm_profiles policy can call it without recursing).
--
-- Idempotent: IF NOT EXISTS on tables/indexes, drop-then-create on policies,
-- so it is safe to re-run against the live DB (which is migrated separately).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Resolve the caller's CRM org. SECURITY DEFINER so it bypasses RLS — this is
-- what lets policies (including crm_profiles' own) reference the caller's org
-- without triggering infinite recursion. Returns NULL for anyone without an
-- ACTIVE crm_profiles row, which (because every policy compares against it)
-- means "no CRM access at all".
create or replace function public.crm_current_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id
  from public.crm_profiles
  where id = auth.uid()
    and is_active
  limit 1
$$;

revoke all on function public.crm_current_org() from public;
grant execute on function public.crm_current_org() to authenticated;

-- Generic updated_at bumper.
create or replace function public.crm_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── crm_orgs ─────────────────────────────────────────────────────────────────
create table if not exists public.crm_orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_orgs enable row level security;

drop trigger if exists crm_orgs_set_updated_at on public.crm_orgs;
create trigger crm_orgs_set_updated_at before update on public.crm_orgs
  for each row execute function public.crm_set_updated_at();

-- ── crm_profiles ─────────────────────────────────────────────────────────────
-- id IS the Supabase Auth user id. This is the membership table.
create table if not exists public.crm_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_profiles_org_idx on public.crm_profiles (org_id);

alter table public.crm_profiles enable row level security;

drop trigger if exists crm_profiles_set_updated_at on public.crm_profiles;
create trigger crm_profiles_set_updated_at before update on public.crm_profiles
  for each row execute function public.crm_set_updated_at();

-- ── crm_accounts (companies) ─────────────────────────────────────────────────
create table if not exists public.crm_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  name text not null,
  industry text,
  website text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  dot_number text,
  mc_number text,
  company_size text,
  fleet_size integer,
  annual_freight_spend numeric,
  revenue_potential numeric,
  current_carrier text,
  lifecycle_status text not null default 'lead',
  source text,
  assigned_user_id uuid references public.crm_profiles(id) on delete set null,
  -- FK to crm_contacts added after that table exists (circular reference).
  primary_contact_id uuid,
  custom jsonb not null default '{}'::jsonb,
  search_tsv tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists crm_accounts_org_idx on public.crm_accounts (org_id);
create index if not exists crm_accounts_assigned_idx on public.crm_accounts (assigned_user_id);
create index if not exists crm_accounts_lifecycle_idx on public.crm_accounts (org_id, lifecycle_status) where deleted_at is null;
create index if not exists crm_accounts_search_idx on public.crm_accounts using gin (search_tsv);

alter table public.crm_accounts enable row level security;

drop trigger if exists crm_accounts_set_updated_at on public.crm_accounts;
create trigger crm_accounts_set_updated_at before update on public.crm_accounts
  for each row execute function public.crm_set_updated_at();

-- Keep search_tsv in sync from the most searchable fields.
create or replace function public.crm_accounts_tsv()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv :=
    to_tsvector('simple',
      coalesce(new.name, '') || ' ' ||
      coalesce(new.industry, '') || ' ' ||
      coalesce(new.city, '') || ' ' ||
      coalesce(new.state, '') || ' ' ||
      coalesce(new.current_carrier, '') || ' ' ||
      coalesce(new.dot_number, '') || ' ' ||
      coalesce(new.mc_number, ''));
  return new;
end;
$$;

drop trigger if exists crm_accounts_tsv_trg on public.crm_accounts;
create trigger crm_accounts_tsv_trg before insert or update on public.crm_accounts
  for each row execute function public.crm_accounts_tsv();

-- ── crm_contacts ─────────────────────────────────────────────────────────────
create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete cascade,
  name text not null,
  title text,
  email text,
  phone text,
  mobile text,
  extension text,
  best_time_to_call text,
  is_decision_maker boolean not null default false,
  linkedin_url text,
  last_contacted_at timestamptz,
  next_followup_at timestamptz,
  notes text,
  custom jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists crm_contacts_org_idx on public.crm_contacts (org_id);
create index if not exists crm_contacts_account_idx on public.crm_contacts (account_id);
create index if not exists crm_contacts_followup_idx on public.crm_contacts (org_id, next_followup_at) where deleted_at is null;

alter table public.crm_contacts enable row level security;

drop trigger if exists crm_contacts_set_updated_at on public.crm_contacts;
create trigger crm_contacts_set_updated_at before update on public.crm_contacts
  for each row execute function public.crm_set_updated_at();

-- Now that crm_contacts exists, wire up the circular FK from crm_accounts.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_accounts_primary_contact_fk'
  ) then
    alter table public.crm_accounts
      add constraint crm_accounts_primary_contact_fk
      foreign key (primary_contact_id) references public.crm_contacts(id) on delete set null;
  end if;
end;
$$;

-- ── crm_pipelines ────────────────────────────────────────────────────────────
create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_pipelines_org_idx on public.crm_pipelines (org_id);

alter table public.crm_pipelines enable row level security;

drop trigger if exists crm_pipelines_set_updated_at on public.crm_pipelines;
create trigger crm_pipelines_set_updated_at before update on public.crm_pipelines
  for each row execute function public.crm_set_updated_at();

-- ── crm_pipeline_stages ──────────────────────────────────────────────────────
create table if not exists public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  pipeline_id uuid not null references public.crm_pipelines(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  probability_default numeric,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_pipeline_stages_org_idx on public.crm_pipeline_stages (org_id);
create index if not exists crm_pipeline_stages_pipeline_idx on public.crm_pipeline_stages (pipeline_id, sort_order);

alter table public.crm_pipeline_stages enable row level security;

drop trigger if exists crm_pipeline_stages_set_updated_at on public.crm_pipeline_stages;
create trigger crm_pipeline_stages_set_updated_at before update on public.crm_pipeline_stages
  for each row execute function public.crm_set_updated_at();

-- ── crm_deals ────────────────────────────────────────────────────────────────
create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete cascade,
  name text not null,
  pipeline_id uuid references public.crm_pipelines(id) on delete set null,
  stage_id uuid references public.crm_pipeline_stages(id) on delete set null,
  estimated_revenue numeric,
  probability numeric,
  expected_close_date date,
  freight_type text,
  lane_origin text,
  lane_dest text,
  rate numeric,
  status text not null default 'open',
  won_reason text,
  lost_reason text,
  assigned_user_id uuid references public.crm_profiles(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists crm_deals_org_idx on public.crm_deals (org_id);
create index if not exists crm_deals_account_idx on public.crm_deals (account_id);
create index if not exists crm_deals_pipeline_idx on public.crm_deals (pipeline_id);
create index if not exists crm_deals_stage_idx on public.crm_deals (stage_id);
create index if not exists crm_deals_assigned_idx on public.crm_deals (assigned_user_id);
create index if not exists crm_deals_status_idx on public.crm_deals (org_id, status) where deleted_at is null;

alter table public.crm_deals enable row level security;

drop trigger if exists crm_deals_set_updated_at on public.crm_deals;
create trigger crm_deals_set_updated_at before update on public.crm_deals
  for each row execute function public.crm_set_updated_at();

-- ── crm_activities ───────────────────────────────────────────────────────────
create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  deal_id uuid references public.crm_deals(id) on delete set null,
  user_id uuid references public.crm_profiles(id) on delete set null,
  kind text not null,
  summary text,
  body text,
  meta jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_activities_org_idx on public.crm_activities (org_id);
create index if not exists crm_activities_account_idx on public.crm_activities (account_id, occurred_at desc);
create index if not exists crm_activities_deal_idx on public.crm_activities (deal_id);
create index if not exists crm_activities_contact_idx on public.crm_activities (contact_id);

alter table public.crm_activities enable row level security;

drop trigger if exists crm_activities_set_updated_at on public.crm_activities;
create trigger crm_activities_set_updated_at before update on public.crm_activities
  for each row execute function public.crm_set_updated_at();

-- ── crm_calls ────────────────────────────────────────────────────────────────
create table if not exists public.crm_calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  user_id uuid references public.crm_profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  duration_seconds integer,
  outcome text,
  disposition text,
  summary text,
  notes text,
  recording_path text,
  followup_required boolean not null default false,
  reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists crm_calls_org_idx on public.crm_calls (org_id);
create index if not exists crm_calls_account_idx on public.crm_calls (account_id, occurred_at desc);
create index if not exists crm_calls_contact_idx on public.crm_calls (contact_id);
create index if not exists crm_calls_reminder_idx on public.crm_calls (org_id, reminder_at) where followup_required;

-- Reconciles this committed migration with a column (deleted_at, for
-- deleteCall's soft delete) that was already added directly to prod without
-- a matching migration file — safe to leave as a plain ALTER since the
-- `create table if not exists` above is a no-op on any environment where
-- crm_calls already exists.
alter table public.crm_calls add column if not exists deleted_at timestamptz;

-- Same drift-reconciliation pattern as deleted_at above: phone was added
-- directly to prod (nullable text) for the rebuilt Log Call dialog's
-- phone-only/unlinked-call path — a call with no resolvable contact/company
-- still stores the raw dialed number here instead of being dropped.
alter table public.crm_calls add column if not exists phone text;

alter table public.crm_calls enable row level security;

drop trigger if exists crm_calls_set_updated_at on public.crm_calls;
create trigger crm_calls_set_updated_at before update on public.crm_calls
  for each row execute function public.crm_set_updated_at();

-- ── crm_tasks ────────────────────────────────────────────────────────────────
create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete cascade,
  deal_id uuid references public.crm_deals(id) on delete set null,
  assigned_user_id uuid references public.crm_profiles(id) on delete set null,
  title text not null,
  notes text,
  due_at timestamptz,
  priority text not null default 'normal',
  status text not null default 'open',
  reminder_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_tasks_org_idx on public.crm_tasks (org_id);
create index if not exists crm_tasks_assigned_due_idx on public.crm_tasks (assigned_user_id, due_at);
create index if not exists crm_tasks_account_idx on public.crm_tasks (account_id);
create index if not exists crm_tasks_deal_idx on public.crm_tasks (deal_id);
create index if not exists crm_tasks_status_idx on public.crm_tasks (org_id, status);

alter table public.crm_tasks enable row level security;

drop trigger if exists crm_tasks_set_updated_at on public.crm_tasks;
create trigger crm_tasks_set_updated_at before update on public.crm_tasks
  for each row execute function public.crm_set_updated_at();

-- ── crm_notes ────────────────────────────────────────────────────────────────
create table if not exists public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  deal_id uuid references public.crm_deals(id) on delete set null,
  user_id uuid references public.crm_profiles(id) on delete set null,
  body text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_notes_org_idx on public.crm_notes (org_id);
create index if not exists crm_notes_account_idx on public.crm_notes (account_id, created_at desc);
create index if not exists crm_notes_deal_idx on public.crm_notes (deal_id);

alter table public.crm_notes enable row level security;

drop trigger if exists crm_notes_set_updated_at on public.crm_notes;
create trigger crm_notes_set_updated_at before update on public.crm_notes
  for each row execute function public.crm_set_updated_at();

-- ── crm_tags + crm_account_tags ──────────────────────────────────────────────
create table if not exists public.crm_tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  label text not null,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_tags_org_idx on public.crm_tags (org_id);

alter table public.crm_tags enable row level security;

drop trigger if exists crm_tags_set_updated_at on public.crm_tags;
create trigger crm_tags_set_updated_at before update on public.crm_tags
  for each row execute function public.crm_set_updated_at();

-- Join table. org_id is carried here too (per the "every table has org_id"
-- rule) so RLS can scope it directly without a join back to the parent.
create table if not exists public.crm_account_tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  account_id uuid not null references public.crm_accounts(id) on delete cascade,
  tag_id uuid not null references public.crm_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (account_id, tag_id)
);

create index if not exists crm_account_tags_org_idx on public.crm_account_tags (org_id);
create index if not exists crm_account_tags_account_idx on public.crm_account_tags (account_id);
create index if not exists crm_account_tags_tag_idx on public.crm_account_tags (tag_id);

alter table public.crm_account_tags enable row level security;

-- ── crm_documents ────────────────────────────────────────────────────────────
create table if not exists public.crm_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete cascade,
  deal_id uuid references public.crm_deals(id) on delete set null,
  user_id uuid references public.crm_profiles(id) on delete set null,
  kind text,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists crm_documents_org_idx on public.crm_documents (org_id);
create index if not exists crm_documents_account_idx on public.crm_documents (account_id);
create index if not exists crm_documents_deal_idx on public.crm_documents (deal_id);

alter table public.crm_documents enable row level security;

drop trigger if exists crm_documents_set_updated_at on public.crm_documents;
create trigger crm_documents_set_updated_at before update on public.crm_documents
  for each row execute function public.crm_set_updated_at();

-- ── RLS POLICIES ─────────────────────────────────────────────────────────────
-- DENY BY DEFAULT: RLS is enabled above and no policy grants anything to anon.
-- authenticated users get exactly the rows whose org matches crm_current_org().
-- Each `for all` policy covers select/insert/update/delete with matching
-- USING + WITH CHECK so a user can never read, write, or reassign rows into
-- another org.

-- crm_orgs: the caller may see ONLY their own org row.
drop policy if exists crm_orgs_rw on public.crm_orgs;
create policy crm_orgs_rw on public.crm_orgs
  for all to authenticated
  using (id = public.crm_current_org())
  with check (id = public.crm_current_org());

-- crm_profiles: rows in the caller's org (their own row included).
drop policy if exists crm_profiles_rw on public.crm_profiles;
create policy crm_profiles_rw on public.crm_profiles
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

-- All org-scoped domain tables share the identical org-match policy.
drop policy if exists crm_accounts_rw on public.crm_accounts;
create policy crm_accounts_rw on public.crm_accounts
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

drop policy if exists crm_contacts_rw on public.crm_contacts;
create policy crm_contacts_rw on public.crm_contacts
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

drop policy if exists crm_pipelines_rw on public.crm_pipelines;
create policy crm_pipelines_rw on public.crm_pipelines
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

drop policy if exists crm_pipeline_stages_rw on public.crm_pipeline_stages;
create policy crm_pipeline_stages_rw on public.crm_pipeline_stages
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

drop policy if exists crm_deals_rw on public.crm_deals;
create policy crm_deals_rw on public.crm_deals
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

drop policy if exists crm_activities_rw on public.crm_activities;
create policy crm_activities_rw on public.crm_activities
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

drop policy if exists crm_calls_rw on public.crm_calls;
create policy crm_calls_rw on public.crm_calls
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

drop policy if exists crm_tasks_rw on public.crm_tasks;
create policy crm_tasks_rw on public.crm_tasks
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

drop policy if exists crm_notes_rw on public.crm_notes;
create policy crm_notes_rw on public.crm_notes
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

drop policy if exists crm_tags_rw on public.crm_tags;
create policy crm_tags_rw on public.crm_tags
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

drop policy if exists crm_account_tags_rw on public.crm_account_tags;
create policy crm_account_tags_rw on public.crm_account_tags
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

drop policy if exists crm_documents_rw on public.crm_documents;
create policy crm_documents_rw on public.crm_documents
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

-- ── Storage bucket: crm-documents ────────────────────────────────────────────
-- Private bucket. Objects are laid out as `<org_id>/<...>` so RLS can scope by
-- the first path segment. Only authenticated CRM users may touch objects under
-- their own org's folder; anon gets nothing.
insert into storage.buckets (id, name, public)
values ('crm-documents', 'crm-documents', false)
on conflict (id) do nothing;

drop policy if exists crm_documents_storage_rw on storage.objects;
create policy crm_documents_storage_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'crm-documents'
    and (storage.foldername(name))[1] = public.crm_current_org()::text
  )
  with check (
    bucket_id = 'crm-documents'
    and (storage.foldername(name))[1] = public.crm_current_org()::text
  );
