-- 20260825010000_crm_quick_tasks.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Admin → Overview's one-click task buttons ("Or send them a task"), as real
-- org-shared rows instead of a hardcoded list.
--
-- WHY A TABLE AND NOT JSONB ON crm_orgs. The alternative was an array column
-- on the org row. A table wins on four counts, and the fourth is the one that
-- actually bites:
--   * add/delete are row operations. With a JSONB array every edit is a
--     read-modify-write of the whole list, so two admins editing at the same
--     moment silently clobber each other.
--   * RLS matches every other org-scoped table here (org_id = crm_current_org()),
--     rather than inheriting whatever the crm_orgs row happens to allow.
--   * soft delete via deleted_at matches the convention crm_shipments /
--     crm_otr_entries / crm_bol_entries all use, so a button removed by
--     accident is recoverable. An array splice is gone.
--   * sort_order is a real column, so drag-to-reorder later is an UPDATE
--     rather than rewriting the whole blob.
-- It would only have been the wrong call if these were per-USER preferences;
-- they are explicitly shared across the org.
--
-- STRICTLY ADDITIVE. This migration creates one table and inserts into that
-- table only. It alters no existing table, adds no column to anything else,
-- and modifies no existing row.
--
-- No updated_at column, so no crm_set_updated_at trigger: a quick task is a
-- label that is created and deleted, never edited in place (the UI has no
-- rename), and a column nothing writes is a column that goes stale.
--
-- Idempotent throughout — create table if not exists, create index if not
-- exists, drop policy if exists, and a not-exists guard on the seed — matching
-- every prior CRM migration.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.crm_quick_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references public.crm_profiles(id) on delete set null,
  deleted_at timestamptz
);

-- The list is always read as "this org's live buttons, in order", so the
-- index carries the sort and excludes soft-deleted rows — same partial-index
-- shape as crm_accounts_lifecycle_idx / crm_contacts_followup_idx.
create index if not exists crm_quick_tasks_org_order_idx
  on public.crm_quick_tasks (org_id, sort_order)
  where deleted_at is null;

alter table public.crm_quick_tasks enable row level security;

drop policy if exists crm_quick_tasks_rw on public.crm_quick_tasks;
create policy crm_quick_tasks_rw on public.crm_quick_tasks
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());

-- ── Seed: the default button set ────────────────────────────────────────────
-- Freight-specific wording, not generic CRM verbs. Note "Call or reach out"
-- rather than "Call them back": a rep emails and texts at least as often as
-- they dial, and "back" wrongly implies the customer called first.
--
-- Guarded on the ORG having no live rows at all, not per-label, so an admin
-- who deletes a default button does not have it silently reinstated the next
-- time this migration is replayed.
insert into public.crm_quick_tasks (org_id, label, sort_order)
select o.id, t.label, t.sort_order
from public.crm_orgs o
cross join (values
  ('Call or reach out', 0),
  ('Follow up', 1),
  ('Research this company', 2),
  ('Send a quote', 3),
  ('Ask about upcoming loads', 4),
  ('Get their lanes', 5),
  ('Chase the PO', 6),
  ('Confirm pickup details', 7),
  ('Send the carrier packet', 8),
  ('Re-engage — gone quiet', 9),
  ('Update contact info', 10),
  ('Schedule a check-in', 11)
) as t(label, sort_order)
where not exists (
  select 1 from public.crm_quick_tasks q
  where q.org_id = o.id and q.deleted_at is null
);
