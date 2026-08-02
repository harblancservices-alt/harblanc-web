-- 20260801000000_expenses_quickbooks.sql
-- Expenses page redesign (QuickBooks-style ledger). Additive only — every
-- existing recurring_expenses / expense_accounts column stays intact.
--
-- recurring_expenses gains:
--   archived         — soft "status" flag (Active vs Archived), separate
--                       from the existing deleted_at soft-delete.
--   start_date        — anchor date, mainly used by the new "onetime"
--                       frequency (which has no day_of_month/day_of_week
--                       to compute a next-charge date from).
--   tags              — freeform labels shown in the detail slide-over.
--   skip_next_date    — set by the "Skip Next Payment" row action to the
--                       date of the occurrence being skipped; the app's
--                       next-charge calculation walks past this date once,
--                       then ignores it once it's in the past.
--
-- expense_accounts (the "cards / accounts" list, renamed Payment Methods in
-- the UI) gains:
--   type        — Credit Card / Debit Card / Bank Account / ACH / Other.
--   last4       — last 4 digits only, never a full card number.
--   is_default  — one default payment method for new expenses.
--
-- New table expense_activity — a lightweight audit trail (create / update /
-- archive / restore / duplicate / skip / delete) shown in the detail
-- slide-over's Activity History section. Row-level, service-role only —
-- same deny-all RLS posture as every other admin-only table.

alter table public.recurring_expenses
  add column if not exists archived boolean not null default false;
alter table public.recurring_expenses
  add column if not exists start_date date;
alter table public.recurring_expenses
  add column if not exists tags text[] not null default '{}'::text[];
alter table public.recurring_expenses
  add column if not exists skip_next_date date;

alter table public.expense_accounts
  add column if not exists type text;
alter table public.expense_accounts
  add column if not exists last4 text;
alter table public.expense_accounts
  add column if not exists is_default boolean not null default false;

create table if not exists public.expense_activity (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null
    references public.recurring_expenses(id) on delete cascade,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists expense_activity_expense_id_idx
  on public.expense_activity (expense_id, created_at desc);

alter table public.expense_activity enable row level security;
-- No policies. Deny-all to anon/auth; service-role server actions only,
-- matching recurring_expenses / expense_accounts / maintenance_attachments.
