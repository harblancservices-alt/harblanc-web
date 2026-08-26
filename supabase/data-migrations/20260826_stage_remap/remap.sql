-- Remap the stored six-stage vocabulary onto the ten. 2026-08-26.
--
-- APPROVED BY BRENT, who settled the one ambiguous case himself:
--   "i think the company should land into the sales agents inbox as
--    new lead/research"
--
-- So `researching` becomes New Lead, flat. Research is not a stage under this
-- model -- it is the first TASK on a New Lead, created when the company is
-- assigned. An earlier proposal split `researching` three ways on call
-- history; that is superseded. The five forward-only stages (Qualified,
-- Engaged, Setup, Dormant, Disqualified) receive NOTHING: they are stages a
-- person moves a company into deliberately, and nothing should arrive in one
-- by migration.
--
-- THE MAPPING
--   new_lead         51  ->  new_lead       (unchanged, not touched)
--   researching      34  ->  new_lead
--   contacted         8  ->  contacted      (unchanged, not touched)
--   lost              5  ->  lost           (unchanged, not touched)
--   active_customer   1  ->  active
--   quoting           0  ->  quoting        (no rows exist)
--   99 rows total.
--
-- EXPECTED AFTER: new_lead 85, contacted 8, lost 5, active 1.
--
-- Only the 35 rows that actually change are written. The four direct-map
-- values are left alone rather than re-written to themselves -- an UPDATE
-- that changes nothing still bumps row versions and muddies any audit.
--
-- DELIBERATELY DOES NOT TOUCH stage_changed_at. Re-labelling a stage is not
-- the company changing stage. Stamping it would reset every staleness clock
-- in the book and make 35 companies look freshly moved.
--
-- The app already rendered correctly before this ran, because normalizeStage
-- maps old values at read time. This is about what the database stores.

begin;

-- The old value is recorded on an activity per row, which is what makes
-- rollback.sql exact. Written BEFORE the updates, while the old value is
-- still readable.
insert into crm_activities (org_id, account_id, user_id, kind, summary, meta)
select a.org_id, a.id, null, 'lifecycle_changed',
       'Stage vocabulary remapped (six -> ten)',
       jsonb_build_object(
         'migration', 'stage_remap_2026_08_26',
         'from', a.lifecycle_status
       )
from crm_accounts a
where a.deleted_at is null
  and a.lifecycle_status in ('researching', 'active_customer');

-- researching -> new_lead. Brent's ruling.
update crm_accounts
set lifecycle_status = 'new_lead'
where deleted_at is null and lifecycle_status = 'researching';

-- active_customer -> active. A pure rename.
update crm_accounts
set lifecycle_status = 'active'
where deleted_at is null and lifecycle_status = 'active_customer';

commit;

select lifecycle_status, count(*)
from crm_accounts where deleted_at is null
group by 1 order by 2 desc;
