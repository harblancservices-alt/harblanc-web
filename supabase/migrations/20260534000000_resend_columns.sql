-- 20260534000000_resend_columns.sql
-- Phase Q1 — Document resend support.
--
-- The existing one-draft-per-lead unique-while-null indexes
-- (`dispatch_estimates_one_draft_per_request`, the equivalent on
-- `finalized_quotes` and `bills_of_lading`) already allow any number
-- of SENT rows to coexist. A "resend" is operationally identical to
-- a new sent row whose preview_* columns are copied verbatim from
-- a prior sent row — preserving preview/send byte parity by
-- construction. The only new schema requirement is a self-referential
-- FK so the operator UI can render "Resent from FQ-…" badges and so
-- bounce attribution (Phase Q2) can chain back to the original.

alter table public.dispatch_estimates
  add column if not exists resent_from_id uuid
    references public.dispatch_estimates(id) on delete set null;

alter table public.finalized_quotes
  add column if not exists resent_from_id uuid
    references public.finalized_quotes(id) on delete set null;

alter table public.bills_of_lading
  add column if not exists resent_from_id uuid
    references public.bills_of_lading(id) on delete set null;

-- Lookup index for "show me every resend rooted at this original".
-- Partial because the column is null on every original (non-resent) row.

create index if not exists dispatch_estimates_resent_from_id_idx
  on public.dispatch_estimates (resent_from_id)
  where resent_from_id is not null;

create index if not exists finalized_quotes_resent_from_id_idx
  on public.finalized_quotes (resent_from_id)
  where resent_from_id is not null;

create index if not exists bills_of_lading_resent_from_id_idx
  on public.bills_of_lading (resent_from_id)
  where resent_from_id is not null;
