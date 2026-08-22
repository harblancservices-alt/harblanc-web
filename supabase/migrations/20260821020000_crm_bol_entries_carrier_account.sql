-- 20260821020000_crm_bol_entries_carrier_account.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Carrier override persistence for BOL Center. The carrier printed on a BOL
-- is excluded from prospecting by default (see prospectCarrier's header
-- comment in src/app/crm/(authed)/admin/bol-center/actions.ts) — this adds
-- the FK slot for the rare explicit override ("Actually, treat as a
-- prospect"), same shape as matched_shipper_account_id/
-- matched_consignee_account_id/matched_bill_to_account_id added in
-- 20260821000000_crm_bol_entries_workflow.sql and
-- 20260821010000_crm_bol_entries_bill_to_and_doc_fanout.sql. Without this
-- column the override's result never survived a page refresh.
--
-- ALREADY APPLIED TO PROD BY HAND (Brent, 2026-08-21) — this file is
-- committed after the fact so the schema is tracked in source control,
-- matching this repo's "no schema without asking" convention. Idempotent
-- (add column if not exists, inline FK) so re-running it is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.crm_bol_entries
  add column if not exists matched_carrier_account_id uuid references public.crm_accounts(id) on delete set null;
