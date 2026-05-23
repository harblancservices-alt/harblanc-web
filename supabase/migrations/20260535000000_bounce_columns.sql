-- 20260535000000_bounce_columns.sql
-- Phase Q2 — Inbound bounce / delivery-failure ingestion.
--
-- Resend's webhook delivers bounce events (hard, soft, complaint) keyed by
-- the same email id we already persist in `sent_email_id` on each of the
-- three deliverable tables. We do NOT add a separate bounce_events table:
-- bounces are a property of the specific sent row, and querying by
-- sent_email_id is the only access pattern we need for the webhook.
--
-- Three columns per table:
--   bounced_at     — when Resend first told us this send failed. NULL =
--                    healthy / not yet reported.
--   bounce_kind    — one of 'hard', 'soft', 'complaint'. Hard = permanent
--                    failure (bad address, mailbox closed). Soft = transient
--                    (mailbox full, server down) — Resend still retries.
--                    Complaint = recipient marked as spam (Resend treats
--                    this as a sender-reputation hazard).
--   bounce_reason  — free-form upstream message ("550 mailbox full", etc.)
--                    Surfaced verbatim in the Sent-list UI as a tooltip.
--
-- We keep this denormalized (no JSON column) because:
--   - the operator UI cares about exactly these three facts
--   - timeline events carry the full payload anyway for auditability
--   - querying by bounce_kind is cheap with the partial index below
--
-- The partial unique index on sent_email_id (one per deliverable table)
-- is the index the webhook uses to locate the right row. It is partial
-- because sent_email_id is NULL on draft rows; we never want to match a
-- draft against an incoming bounce.
--
-- Bounce columns are intentionally NOT touched on resend (resendEstimate
-- / resendFinalizedQuote / resendBol from Phase Q1 insert fresh rows
-- with sent_email_id from the new send). A bounce on the resent row is
-- a fresh bounce on a fresh sent_email_id; it has no relation to the
-- bounce_at/bounce_kind on the original.

alter table public.dispatch_estimates
  add column if not exists bounced_at timestamptz,
  add column if not exists bounce_kind text,
  add column if not exists bounce_reason text;

alter table public.dispatch_estimates
  add constraint dispatch_estimates_bounce_kind_check
    check (bounce_kind is null or bounce_kind in ('hard', 'soft', 'complaint'))
    not valid;

alter table public.dispatch_estimates
  validate constraint dispatch_estimates_bounce_kind_check;

alter table public.finalized_quotes
  add column if not exists bounced_at timestamptz,
  add column if not exists bounce_kind text,
  add column if not exists bounce_reason text;

alter table public.finalized_quotes
  add constraint finalized_quotes_bounce_kind_check
    check (bounce_kind is null or bounce_kind in ('hard', 'soft', 'complaint'))
    not valid;

alter table public.finalized_quotes
  validate constraint finalized_quotes_bounce_kind_check;

alter table public.bills_of_lading
  add column if not exists bounced_at timestamptz,
  add column if not exists bounce_kind text,
  add column if not exists bounce_reason text;

alter table public.bills_of_lading
  add constraint bills_of_lading_bounce_kind_check
    check (bounce_kind is null or bounce_kind in ('hard', 'soft', 'complaint'))
    not valid;

alter table public.bills_of_lading
  validate constraint bills_of_lading_bounce_kind_check;

-- Partial unique indexes on sent_email_id. These serve two purposes:
--   1. The webhook's primary lookup: WHERE sent_email_id = <provider id>.
--   2. Prevent two sent rows from ever sharing the same provider id,
--      which would make bounce attribution ambiguous.
-- The partial WHERE clause excludes drafts (sent_email_id IS NULL),
-- so multiple drafts coexist freely.

create unique index if not exists dispatch_estimates_sent_email_id_uq
  on public.dispatch_estimates (sent_email_id)
  where sent_email_id is not null;

create unique index if not exists finalized_quotes_sent_email_id_uq
  on public.finalized_quotes (sent_email_id)
  where sent_email_id is not null;

create unique index if not exists bills_of_lading_sent_email_id_uq
  on public.bills_of_lading (sent_email_id)
  where sent_email_id is not null;
