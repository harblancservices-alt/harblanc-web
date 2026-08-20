-- 20260821000000_crm_bol_entries_workflow.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- BOL Center v2 — reshapes crm_bol_entries from a text-only research-note
-- table into the anchor record for a real document → company/contact →
-- prospect REVIEW workflow. Intake itself stays external (an upstream Claude
-- session extracts/researches a BOL photo and inserts the row + attaches the
-- document); this migration only adds what the CRM's own review UI needs to
-- resolve that row against real crm_accounts/crm_contacts/crm_account_locations
-- records without ever duplicating them.
--
-- document_id points at the uploaded/attached BOL image or PDF, reusing the
-- existing generic crm_documents table + private "crm-documents" storage
-- bucket (same table BolSection.tsx already writes kind='bol' rows into) —
-- no new table, no new bucket, no new storage policy.
--
-- matched_{shipper,consignee}_account_id / matched_{shipper,consignee}_location_id
-- are the resolution slots the review UI fills in once an admin links this
-- BOL's shipper/consignee to an existing company (or a newly created one via
-- the existing createAccount()/createLocation() actions) — never a duplicate
-- parallel record.
--
-- released_account_id (singular) is dropped: two independent parties per BOL
-- don't fit a single "the" company. released_at/released_by_user_id are
-- renamed to processed_at/processed_by_user_id — "released" implied creating
-- a company outright (OTR's meaning); this workflow's terminal action is
-- "Mark BOL Processed", a real completion marker independent of whether a
-- company was linked or newly created.
--
-- Status vocabulary narrows to the 5 states the real review workflow uses:
-- new (just entered, untouched), needs_review (admin explicitly flagged
-- something ambiguous), ready (both shipper and consignee companies are
-- resolved — set automatically by the match/create actions, never a manual
-- label-flip), processed (admin confirmed no further CRM action is needed),
-- ignored (won't be worked, reopenable). The two existing seed rows are
-- status='new' with every new column left null, which is a valid state under
-- this constraint — no data migration needed.
--
-- crm_bol_contacts is new: one row per person identified on the BOL (shipper
-- contact, consignee contact, bill-to contact, or other), independently
-- resolvable against crm_contacts via matched_contact_id so a contact is
-- never created orphaned — it's always tied to whichever company
-- (matched_shipper_account_id / matched_consignee_account_id) its role
-- points at.
--
-- Idempotent throughout, matching this repo's migration convention.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.crm_bol_entries
  add column if not exists document_id uuid references public.crm_documents(id) on delete set null,
  add column if not exists matched_shipper_account_id uuid references public.crm_accounts(id) on delete set null,
  add column if not exists matched_shipper_location_id uuid references public.crm_account_locations(id) on delete set null,
  add column if not exists matched_consignee_account_id uuid references public.crm_accounts(id) on delete set null,
  add column if not exists matched_consignee_location_id uuid references public.crm_account_locations(id) on delete set null;

alter table public.crm_bol_entries drop column if exists released_account_id;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_bol_entries' and column_name = 'released_at'
  ) then
    alter table public.crm_bol_entries rename column released_at to processed_at;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_bol_entries' and column_name = 'released_by_user_id'
  ) then
    alter table public.crm_bol_entries rename column released_by_user_id to processed_by_user_id;
  end if;
end;
$$;

alter table public.crm_bol_entries drop constraint if exists crm_bol_entries_status_check;
alter table public.crm_bol_entries add constraint crm_bol_entries_status_check
  check (status in ('new', 'needs_review', 'ready', 'processed', 'ignored'));

create table if not exists public.crm_bol_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.crm_orgs(id) on delete cascade,
  bol_id uuid not null references public.crm_bol_entries(id) on delete cascade,
  role text not null,
  name text,
  phone text,
  email text,
  matched_contact_id uuid references public.crm_contacts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_bol_contacts_role_check'
  ) then
    alter table public.crm_bol_contacts
      add constraint crm_bol_contacts_role_check
      check (role in ('shipper', 'consignee', 'bill_to', 'other'));
  end if;
end;
$$;

create index if not exists crm_bol_contacts_bol_idx on public.crm_bol_contacts (bol_id);

alter table public.crm_bol_contacts enable row level security;

drop trigger if exists crm_bol_contacts_set_updated_at on public.crm_bol_contacts;
create trigger crm_bol_contacts_set_updated_at before update on public.crm_bol_contacts
  for each row execute function public.crm_set_updated_at();

drop policy if exists crm_bol_contacts_rw on public.crm_bol_contacts;
create policy crm_bol_contacts_rw on public.crm_bol_contacts
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());
