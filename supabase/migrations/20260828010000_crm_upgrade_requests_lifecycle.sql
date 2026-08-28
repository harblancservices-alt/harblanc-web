-- Upgrades Portal: a real issue lifecycle.
--
-- APPLIED to production 2026-08-28 via Supabase apply_migration; this file is
-- the tracked record of that change.
--
-- Strictly additive. Four new NULLABLE columns and a value migration on a
-- table holding 5 real reports from real people; nothing is dropped and no
-- row is deleted. The status rename is a straight 1:1 mapping, so every
-- existing row lands cleanly:
--   new       -> open
--   in_review -> in_progress   (declared in code, never used by any row)
--   done      -> completed
--
-- ORDER MATTERS HERE. The table already carried a CHECK pinning status to
-- ('new','in_review','done'). Dropping it must come BEFORE the UPDATEs --
-- the whole migration runs in one transaction, so an update to 'open' with
-- the old constraint still in place fails the migration outright. It did,
-- on the first attempt, and rolled back cleanly.
--
-- completed_at is deliberately left NULL on the rows that were already
-- 'done'. Nobody recorded when they were finished, and updated_at is only
-- the last time the row changed for any reason -- close, but not recorded.
-- The UI says "date not recorded" rather than inventing one.

alter table crm_upgrade_requests
  add column if not exists started_at      timestamptz,
  add column if not exists completed_at    timestamptz,
  add column if not exists completed_by    uuid,
  add column if not exists completion_note text;

-- 1. Release the old vocabulary.
alter table crm_upgrade_requests
  drop constraint if exists crm_upgrade_requests_status_check;

-- 2. Migrate the existing rows.
update crm_upgrade_requests set status = 'open'        where status = 'new';
update crm_upgrade_requests set status = 'in_progress' where status = 'in_review';
update crm_upgrade_requests set status = 'completed'   where status = 'done';

-- 3. Lock the new vocabulary, only once every row already satisfies it.
alter table crm_upgrade_requests alter column status set default 'open';

alter table crm_upgrade_requests
  add constraint crm_upgrade_requests_status_check
  check (status in ('open', 'in_progress', 'completed', 'closed'));

comment on column crm_upgrade_requests.completed_at is
  'When the request was marked completed. NULL on rows completed before this column existed -- not backfilled, because it was never recorded.';
comment on column crm_upgrade_requests.completion_note is
  'What the developer actually did, shown to the reporter on the completed card.';
