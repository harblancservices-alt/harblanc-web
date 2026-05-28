-- 20260542000000_payments_stripe_columns.sql
-- Stripe online payment support on the existing payments table.
--
-- Phase P1A (the original migration) was designed for operator-recorded
-- payments: wire / ACH / check / card-in-person. All entries were
-- inserted AFTER the money already arrived, so received_at was NOT NULL.
--
-- Customer-side Stripe Checkout inverts that: we insert a "pending" row
-- BEFORE the customer pays so the checkout session id can be tracked,
-- duplicate clicks deduped, and the webhook can update the same row on
-- completion. That requires:
--   1. status column (pending / completed / failed / cancelled)
--   2. stripe_checkout_session_id (with a unique index when present)
--   3. stripe_payment_intent_id (audit / lookup after success)
--   4. received_at made nullable (pending rows have no received-at yet)
--
-- Backward compatible: all existing rows (operator-recorded) get
-- status='completed' by default; their received_at stays populated.

alter table public.payments
  add column if not exists status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed', 'cancelled', 'refunded')),
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text;

-- received_at: NULL allowed for pending Stripe rows. Existing rows
-- already have received_at set so no data backfill is needed.
alter table public.payments
  alter column received_at drop not null;

-- Unique constraint on stripe_checkout_session_id (when present) so
-- webhook lookups are O(1) and a session never accidentally maps to
-- more than one payment row.
create unique index if not exists payments_stripe_session_id_unique
  on public.payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- Find pending payments by finalized quote -- used by the confirm page
-- to decide whether to show "Resume payment" instead of "Pay now".
create index if not exists payments_status_finalized_idx
  on public.payments (finalized_quote_id, status)
  where deleted_at is null;

comment on column public.payments.status is
  'Payment lifecycle: pending (Stripe session created) | completed (paid) | failed | cancelled | refunded. Operator-recorded payments default to completed.';
comment on column public.payments.stripe_checkout_session_id is
  'cs_... session id from Stripe. NULL for operator-recorded payments. Unique when present.';
comment on column public.payments.stripe_payment_intent_id is
  'pi_... payment intent id from Stripe, populated when checkout.session.completed fires. NULL until paid.';
