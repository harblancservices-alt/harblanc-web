-- OTR entries -> unassigned companies, 2026-08-26
--
-- Brent's decision: the review is not a stage before assignment. Deciding WHO
-- to assign a company to IS the review, and research happens after it reaches
-- the agent. So OTR loses its status machine, its approval gate and its page,
-- and an OTR entry becomes an unassigned company the moment it is created.
--
-- This script converts the entries that already existed when that decision was
-- made. Ongoing creation is handled in the app (admin/otr/actions.ts).
--
-- NOTHING IS DESTROYED. crm_otr_entries keeps every row and every column it
-- had; each converted row only gains a pointer to the company it became
-- (released_account_id). That pointer, plus the meta marker on the logged
-- activity, is what makes rollback.sql exact.
--
-- TWO DELIBERATE DEPARTURES from what releaseOtrEntry() does in the app:
--
--   1. NO lifecycle_changed ACTIVITY. The app's release path calls
--      promoteAccountToProspect, which logs lifecycle_changed -- and
--      lifecycle_changed is in CRM_CONTACT_ACTIVITY_KINDS. Replicating it
--      here would stamp all 37 companies as "last contacted today" and
--      poison the hot/cold scale these records are about to feed. The
--      companies are inserted at new_lead directly, so there is no stage
--      change to log in any case. account_created is NOT a contact kind,
--      which is why it is safe to log.
--
--   2. released_by_user_id STAYS NULL. No person released these; a migration
--      converted them. A null there is the honest record, and it doubles as a
--      second way to identify this batch.
--
-- BETCO Scaffolds was held back on the first run (2026-08-26) because it
-- normalizes to the same name as two existing accounts. Brent's ruling later
-- the same day: duplicates do not block conversion, they get LABELLED and he
-- deals with them himself. It was converted in a second pass using this same
-- statement with the id filter removed, and the work pool now shows it as
-- "Duplicate" -- a flag derived at read time by admin/duplicates.ts, never a
-- stored column. 38 of 38 converted; 1 shows the flag.
--
-- SKIPPED: the 3 rejected entries. A rejection is a decision already made;
-- converting one quietly reverses it.

begin;

with src as (
  select
    e.id            as otr_id,
    gen_random_uuid() as new_account_id,
    e.org_id,
    e.company_name,
    e.city,
    e.state,
    e.industry,
    e.notes
  from crm_otr_entries e
  where e.deleted_at is null
    and e.status = 'new'
),
ins_accounts as (
  insert into crm_accounts (
    id, org_id, name, city, state, industry, context_notes,
    source, lifecycle_status, ai_status, assigned_user_id
  )
  select
    s.new_account_id, s.org_id, s.company_name, s.city, s.state, s.industry, s.notes,
    'otr',        -- provenance, same value releaseOtrEntry() writes
    'new_lead',   -- DEFAULT_LIFECYCLE
    'released',   -- what puts it in Admin -> Overview's assign pool
    null          -- unassigned: the whole point
  from src s
  returning id
),
ins_activity as (
  insert into crm_activities (org_id, account_id, user_id, kind, summary, meta)
  select
    s.org_id,
    s.new_account_id,
    null,
    'account_created',
    'Company created from OTR intake',
    jsonb_build_object(
      'migration',    'otr_to_unassigned_2026_08_26',
      'otr_entry_id', s.otr_id
    )
  from src s
  returning id
),
upd_entries as (
  update crm_otr_entries e
  set status              = 'released',
      released_account_id = s.new_account_id,
      released_at         = now(),
      updated_at          = now()
  from src s
  where e.id = s.otr_id
  returning e.id
)
select
  (select count(*) from src)          as in_scope,
  (select count(*) from ins_accounts) as accounts_created,
  (select count(*) from ins_activity) as activities_logged,
  (select count(*) from upd_entries)  as entries_marked;

commit;
