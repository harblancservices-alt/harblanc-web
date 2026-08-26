-- Run this BEFORE remap.sql. Read-only.
--
-- The remap's one real judgement call is promoting 12 companies from
-- `researching` to Contacted because they have a row in crm_calls. This lists
-- them by name so Brent can eyeball them first. If any of those calls were
-- attempts that never reached anybody, that company belongs at Qualified
-- instead and should be moved by hand before the remap runs.

select a.name,
       count(c.id) as logged_calls,
       max(c.occurred_at)::date as last_call,
       case when a.assigned_user_id is null then 'unassigned' else 'assigned' end as owner
from crm_accounts a
join crm_calls c on c.account_id = a.id and c.deleted_at is null
where a.deleted_at is null and a.lifecycle_status = 'researching'
group by a.id, a.name, a.assigned_user_id
order by max(c.occurred_at) desc;

-- What the remap would produce, without changing anything.
select
  case
    when lifecycle_status = 'new_lead' then 'new_lead'
    when lifecycle_status = 'contacted' then 'contacted'
    when lifecycle_status = 'lost' then 'lost'
    when lifecycle_status = 'active_customer' then 'active'
    when lifecycle_status = 'researching'
         and exists (select 1 from crm_calls c where c.account_id = a.id and c.deleted_at is null)
      then 'contacted'
    when lifecycle_status = 'researching' and assigned_user_id is not null then 'qualified'
    when lifecycle_status = 'researching' then 'new_lead'
    else lifecycle_status
  end as would_become,
  count(*) as n
from crm_accounts a
where deleted_at is null
group by 1 order by 2 desc;
