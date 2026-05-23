-- 20260533000000_payments.sql
-- Phase P1A — Manual admin payment recording (foundation only).
--
-- A new child table of finalized_quotes that records WHEN money was
-- actually received against a sent finalized quote / rate confirmation.
-- One-to-many: a single FQ can receive a deposit + a balance, or one
-- wire for the full amount, or three card transactions over time.
--
-- The lead status transition awaiting_payment -> ready_to_dispatch is
-- derived from SUM(payments.amount) vs finalized_quotes.total_amount,
-- NOT a separate column on either table. Keeping money received as
-- its own append-only audit log avoids denormalized-state-drift bugs.
--
-- Phase P1A is foundation-only:
--   - No server actions yet (Phase P1B)
--   - No UI yet (Phase P1C)
--   - No status auto-advance yet (Phase P1B)
-- This migration ONLY creates the table + indexes so subsequent
-- phases have a stable schema to write code against.

-- ----- payments table --------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),

  -- Money is recorded against a SPECIFIC finalized quote (the
  -- artifact that defines what is owed). The quote_request_id is
  -- also carried so cascade-delete from a lead reaches payments
  -- without traversing finalized_quotes.
  finalized_quote_id uuid not null
    references public.finalized_quotes(id) on delete cascade,
  quote_request_id uuid not null
    references public.quote_requests(id) on delete cascade,

  -- The dollars (or other currency) received. Positive only — refunds,
  -- if/when added, get their own table to avoid sign-flipping math.
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'USD',

  -- WHEN the money actually arrived (bank-cleared / check-deposited /
  -- card-charged date). Operator-entered; can be back-dated since
  -- Brent often records receipts hours or days after the fact.
  received_at timestamptz not null,

  -- HOW it was received. Constrained at the UI layer to a known list
  -- (wire / ach / check / card_in_person / card_phone / other) but
  -- stored as free text so we can extend without an enum migration
  -- when new channels appear (factor advance, broker hold, etc.).
  method text not null,

  -- Operator-entered reference for auditing — check number, wire
  -- confirmation code, card last-4, deposit slip ID, etc.
  reference text,

  -- Optional free-form note about this payment specifically.
  notes text,

  -- Audit columns.
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now(),

  -- Soft delete mirrors the existing pattern on dispatch_estimates,
  -- finalized_quotes, bills_of_lading so trash semantics are uniform.
  deleted_at timestamptz,
  delete_after timestamptz
);

-- ----- indexes ---------------------------------------------------------

-- Primary lookup: "what payments exist on this FQ?" used to compute
-- the paid-so-far summary every time a quote detail page renders.
create index if not exists payments_finalized_quote_id_idx
  on public.payments (finalized_quote_id)
  where deleted_at is null;

-- Lead-scoped lookup: "what payments exist on this lead across all
-- finalized quotes (including re-issues)?" Useful for reporting.
create index if not exists payments_quote_request_id_idx
  on public.payments (quote_request_id)
  where deleted_at is null;

-- Recency ordering for the per-FQ payment history list.
create index if not exists payments_received_at_idx
  on public.payments (received_at desc)
  where deleted_at is null;

-- ----- row-level security ----------------------------------------------

-- Mirror the policy stance of the other ops tables: RLS is enabled and
-- only the service role can read/write. All payment operations happen
-- via the admin server actions using the service-role client. There is
-- no anon access path for the payments table.

alter table public.payments enable row level security;

-- No policies are added → service-role bypasses RLS (as on every other
-- ops table). Anon clients see nothing. The customer-facing portal
-- (Phase P3) will add an explicit, scoped policy when it lands.
