-- 20260547000000_maintenance_expense_tracking.sql
-- Expense tracking on the "Add Service" flow: a per-service expense category
-- and total cost, plus a per-receipt amount + label (e.g. one receipt for
-- "Parts", another for "Labor" on the same service).
--
-- The backend is already applied on the live DB; this file is a repo record.
-- IF NOT EXISTS guards make it a no-op against the live schema.

-- Per-service category + total cost.
alter table public.maintenance_log
  add column if not exists category text;
alter table public.maintenance_log
  add column if not exists total_cost numeric(10, 2);

-- Per-receipt price + label.
alter table public.maintenance_attachments
  add column if not exists amount numeric(10, 2);
alter table public.maintenance_attachments
  add column if not exists label text;
