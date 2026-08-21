-- 20260821010000_crm_bol_entries_bill_to_and_doc_fanout.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Two corrections to the BOL Center workflow shipped in
-- 20260821000000_crm_bol_entries_workflow.sql, found while working the two
-- real seed BOLs:
--
-- 1. matched_bill_to_account_id — a BOL's Bill To party (crm_bol_entries.
--    bill_to, free text) had no company-matching slot at all, unlike shipper
--    and consignee. Adds the third resolution FK, same shape as the other
--    two. No separate bill_to address/city/state columns exist (bill_to has
--    always been a single text field), so Bill To matching/creation works
--    off that one string — no location-matching slot for it (LOCATIONS
--    stays shipper/consignee only, real physical dock addresses).
--
-- 2. Document visibility — the previous design pointed a BOL's single
--    attached crm_documents row at ONE company (shipper-preferred), so only
--    that company's own BOL tab showed the document; a linked consignee (or
--    now bill-to) saw nothing. This migration doesn't change schema for that
--    (crm_documents already supports many rows sharing one storage_path) —
--    the app code now fans out a lightweight per-company crm_documents row
--    (same storage_path, no duplicate upload) to every resolved company
--    instead of moving a single row's account_id around.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.crm_bol_entries
  add column if not exists matched_bill_to_account_id uuid references public.crm_accounts(id) on delete set null;
