-- 20260807000000_expenses_end_date_account_fk.sql
-- Expenses schema foundation (audit: docs/portal/expenses-performance-audit.md
-- §F). Verified against the live production schema before writing this —
-- recurring_expenses currently has no end_date and no real FK to
-- expense_accounts, only the soft `card` text column matched by name at
-- read time (lib/data/recurring-expenses.ts's fetchAll()).
--
-- 1. end_date — nullable, for bills with a known payoff/cancellation date
--    (equipment financing, a truck/trailer payment with a payoff date).
-- 2. expense_account_id — a real FK to expense_accounts(id). Existing rows
--    are backfilled by matching `card` (text) against expense_accounts.name,
--    case/trim-insensitive (confirmed clean match against live data — no
--    duplicate active account names, no orphaned card strings; applied to
--    prod 2026-08-07: 10 of 18 rows linked, every row with a `card` value
--    matched). `card` is kept as a fallback display value / for any
--    not-yet-matched rows; not dropped here.

alter table public.recurring_expenses
  add column if not exists end_date date;

alter table public.recurring_expenses
  add column if not exists expense_account_id uuid references public.expense_accounts(id);

update public.recurring_expenses re
set expense_account_id = ea.id
from public.expense_accounts ea
where re.expense_account_id is null
  and re.card is not null
  and trim(lower(re.card)) = trim(lower(ea.name))
  and ea.deleted_at is null;

create index if not exists recurring_expenses_expense_account_id_idx
  on public.recurring_expenses (expense_account_id);
