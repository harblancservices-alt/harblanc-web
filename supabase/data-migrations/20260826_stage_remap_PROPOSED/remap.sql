-- PROPOSED -- NOT APPLIED. Awaiting Brent's approval. See README.md.
--
-- Remaps the stored lifecycle_status values from the old six-stage vocabulary
-- onto the ten. The app already renders correctly without this (normalizeStage
-- maps old values at read time); this is about what the database stores.
--
-- DELIBERATELY DOES NOT TOUCH stage_changed_at. Re-labelling a stage is not
-- the company changing stage. Stamping it would reset every staleness clock in
-- the book and make 99 companies look freshly moved.
--
-- Run verify.sql FIRST -- it lists the 12 companies this promotes to Contacted
-- on the strength of their call history, which is the one judgement call here.

begin;

-- The old value is recorded on an activity per row, which is what makes
-- rollback.sql exact.
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

-- active_customer -> active. A pure rename.
update crm_accounts
set lifecycle_status = 'active'
where deleted_at is null and lifecycle_status = 'active_customer';

-- researching splits three ways on what actually happened to the record.
-- Order matters: the call-history arm runs first and the later arms exclude
-- rows already moved, so a company cannot be caught twice.

-- 12 rows: somebody rang them. That is Contacted under any reading.
update crm_accounts a
set lifecycle_status = 'contacted'
where a.deleted_at is null
  and a.lifecycle_status = 'researching'
  and exists (select 1 from crm_calls c where c.account_id = a.id and c.deleted_at is null);

-- 21 rows: owned and worked, but nobody has reached out yet. Qualified holds
-- the funnel position researching had, and unlike New Lead it preserves the
-- fact that this company was deliberately taken on.
update crm_accounts a
set lifecycle_status = 'qualified'
where a.deleted_at is null
  and a.lifecycle_status = 'researching'
  and a.assigned_user_id is not null;

-- 1 row: nobody owns it, nothing has happened. That is New Lead by
-- definition -- calling it Qualified would claim a judgement nobody made.
update crm_accounts a
set lifecycle_status = 'new_lead'
where a.deleted_at is null
  and a.lifecycle_status = 'researching';

commit;

-- Expected after: New Lead 52 - Qualified 21 - Contacted 20 - Active 1 - Lost 5
select lifecycle_status, count(*)
from crm_accounts where deleted_at is null
group by 1 order by 2 desc;
