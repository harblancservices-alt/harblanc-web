-- 20260808020000_crm_upgrade_requests.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CRM "Upgrades" feedback board — any CRM user can post a change/removal
-- request (title + body) with multiple screenshots for Brent to triage.
--
-- NOT YET APPLIED TO PROD — this file is committed so the schema is tracked,
-- but per the "no schema without asking" rule it must be applied by hand
-- (Supabase MCP) before the code that reads/writes these tables deploys.
--
-- Two tables:
--   1. crm_upgrade_requests — one row per submitted request. author_id is
--      display/audit only (who posted it) — same convention as every other
--      crm_* table's user_id column (see crm_documents) — RLS below is purely
--      org-scoped, not author-scoped, matching every other crm_* policy in
--      this codebase; any org member (and Brent) can see the whole board.
--   2. crm_upgrade_attachments — one row per screenshot, since a request can
--      carry multiple. Deliberately its own table rather than reusing
--      crm_documents: crm_documents' target columns (account_id/deal_id) have
--      no slot for "belongs to an upgrade request", and this mirrors
--      crm_documents' own shape closely enough that a new small table is
--      simpler than widening a shared one.
--
-- Screenshots reuse the existing "crm-documents" storage bucket and its
-- existing storage.objects RLS policy (crm_documents_storage_rw, which scopes
-- purely on the first path segment = org_id) — no new bucket or storage
-- policy needed. Upload path convention:
--   <org_id>/upgrades/<request_id>/<uuid>-<sanitizedFileName>
--
-- Idempotent (create table if not exists / drop policy if exists), matching
-- every prior CRM migration's convention.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── crm_upgrade_requests ─────────────────────────────────────────────────────
create table if not exists public.crm_upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  author_id uuid references public.crm_profiles(id) on delete set null,
  title text not null,
  body text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_upgrade_requests_status_check'
  ) then
    alter table public.crm_upgrade_requests
      add constraint crm_upgrade_requests_status_check check (status in ('new', 'in_review', 'done'));
  end if;
end;
$$;

create index if not exists crm_upgrade_requests_org_idx on public.crm_upgrade_requests (org_id, created_at desc);

alter table public.crm_upgrade_requests enable row level security;

drop trigger if exists crm_upgrade_requests_set_updated_at on public.crm_upgrade_requests;
create trigger crm_upgrade_requests_set_updated_at before update on public.crm_upgrade_requests
  for each row execute function public.crm_set_updated_at();

drop policy if exists crm_upgrade_requests_rw on public.crm_upgrade_requests;
create policy crm_upgrade_requests_rw on public.crm_upgrade_requests
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

-- ── crm_upgrade_attachments (screenshots) ────────────────────────────────────
create table if not exists public.crm_upgrade_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  request_id uuid not null references public.crm_upgrade_requests(id) on delete cascade,
  user_id uuid references public.crm_profiles(id) on delete set null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists crm_upgrade_attachments_request_idx on public.crm_upgrade_attachments (request_id);

alter table public.crm_upgrade_attachments enable row level security;

drop policy if exists crm_upgrade_attachments_rw on public.crm_upgrade_attachments;
create policy crm_upgrade_attachments_rw on public.crm_upgrade_attachments
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());
