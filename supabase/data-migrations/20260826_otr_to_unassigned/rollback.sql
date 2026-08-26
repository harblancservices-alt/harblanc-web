-- UNDO for convert.sql. Puts every converted OTR entry back to `new` and
-- removes the company it became, along with that company's created-from-OTR
-- activity.
--
-- HOW THE BATCH IS IDENTIFIED. Every company this migration created has
-- exactly one crm_activities row stamped
--     meta->>'migration' = 'otr_to_unassigned_2026_08_26'
-- with the originating entry id alongside it. That marker is the key, not a
-- timestamp window and not source='otr' -- because from now on the app itself
-- creates source='otr' companies, and those must NOT be caught by this.
--
-- SAFETY: the delete of crm_accounts is guarded so it can only ever remove a
-- company that is still untouched -- still unassigned, with no contacts, no
-- calls, no tasks and no activity beyond the one this migration wrote. If
-- somebody has already picked one up and started working it, that company is
-- LEFT ALONE and reported by the verification query at the bottom. Undo should
-- not throw away real work done since the conversion.
--
-- Run the SELECT at the bottom afterwards to confirm what actually reverted.

begin;

create temporary table _otr_undo on commit drop as
select
  (a.meta->>'otr_entry_id')::uuid as otr_id,
  a.account_id,
  a.id as activity_id
from crm_activities a
where a.meta->>'migration' = 'otr_to_unassigned_2026_08_26';

-- Only revert companies nobody has touched since.
create temporary table _otr_undo_safe on commit drop as
select u.*
from _otr_undo u
join crm_accounts acc on acc.id = u.account_id
where acc.assigned_user_id is null
  and not exists (select 1 from crm_contacts   c where c.account_id = u.account_id)
  and not exists (select 1 from crm_calls      c where c.account_id = u.account_id)
  and not exists (select 1 from crm_tasks      t where t.account_id = u.account_id)
  and not exists (select 1 from crm_deals      d where d.account_id = u.account_id)
  and not exists (
        select 1 from crm_activities x
        where x.account_id = u.account_id and x.id <> u.activity_id);

update crm_otr_entries e
set status              = 'new',
    released_account_id = null,
    released_at         = null,
    released_by_user_id = null,
    updated_at          = now()
from _otr_undo_safe s
where e.id = s.otr_id;

delete from crm_activities where id in (select activity_id from _otr_undo_safe);
delete from crm_accounts   where id in (select account_id  from _otr_undo_safe);

commit;

-- What did NOT revert, and why: any company somebody started working.
select e.company_name, e.released_account_id, acc.assigned_user_id
from crm_otr_entries e
join crm_accounts acc on acc.id = e.released_account_id
where e.status = 'released' and e.released_by_user_id is null;
