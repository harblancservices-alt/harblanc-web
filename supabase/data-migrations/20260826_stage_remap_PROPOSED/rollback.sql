-- UNDO for remap.sql. Puts every remapped row back to the value it held.
--
-- Keyed on the activity each remapped row was stamped with
-- (meta->>'migration' = 'stage_remap_2026_08_26'), which carries the old value
-- in meta->>'from'. Not keyed on a time window and not on the current stage --
-- somebody may legitimately have moved a company since, and this must not
-- silently drag it back.
--
-- SAFETY: only reverts rows whose stage has NOT been touched since the remap.
-- If a real stage change happened afterwards (there will be a later
-- lifecycle_changed activity, or stage_changed_at will have moved), that row is
-- LEFT ALONE and reported at the bottom. Undoing a re-labelling must never undo
-- somebody's actual decision.

begin;

create temporary table _remap_undo on commit drop as
select a.account_id, a.id as activity_id, (a.meta->>'from') as old_value, a.occurred_at
from crm_activities a
where a.meta->>'migration' = 'stage_remap_2026_08_26';

create temporary table _remap_undo_safe on commit drop as
select u.*
from _remap_undo u
join crm_accounts acc on acc.id = u.account_id
where coalesce(acc.stage_changed_at, '-infinity'::timestamptz) < u.occurred_at
  and not exists (
    select 1 from crm_activities later
    where later.account_id = u.account_id
      and later.kind = 'lifecycle_changed'
      and later.occurred_at > u.occurred_at
  );

update crm_accounts acc
set lifecycle_status = s.old_value
from _remap_undo_safe s
where acc.id = s.account_id;

delete from crm_activities where id in (select activity_id from _remap_undo_safe);

commit;

-- What did NOT revert, because somebody changed the stage for real since.
select acc.name, acc.lifecycle_status, acc.stage_changed_at
from _remap_undo u
join crm_accounts acc on acc.id = u.account_id
where u.account_id not in (select account_id from _remap_undo_safe);
