-- 20260522000000_soft_delete_columns.sql
-- Soft-delete columns for quote_requests and applications.
-- deleted_at  — when the row was moved to trash (NULL = active)
-- delete_after — when a future cron may permanently purge the row
--
-- No RLS policy changes: service-role queries bypass RLS as designed,
-- and anon INSERT-only access is unaffected.

alter table public.quote_requests
  add column if not exists deleted_at timestamptz,
  add column if not exists delete_after timestamptz;

alter table public.applications
  add column if not exists deleted_at timestamptz,
  add column if not exists delete_after timestamptz;

-- Indexes for fast active/trash partitioning on list views.
create index if not exists quote_requests_deleted_at_idx
  on public.quote_requests (deleted_at);

create index if not exists applications_deleted_at_idx
  on public.applications (deleted_at);
