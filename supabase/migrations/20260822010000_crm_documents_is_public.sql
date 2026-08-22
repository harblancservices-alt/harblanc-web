-- 20260822010000_crm_documents_is_public.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Per-document PUBLIC flag on crm_documents.
--
-- WHAT IT CONTROLS: whether a document in the owner-only Admin Documents tab
-- (/crm/admin/documents) is visible to SALES AGENTS in Operations → Documents
-- (/crm/operations/documents), where they select documents to bundle into a
-- vendor packet. Admin sees everything; Operations sees only is_public = true.
--
-- WHY THIS TABLE, ONE COLUMN: every row the Admin Documents grid renders is a
-- crm_documents row — both the admin uploads (kind = 'org_doc:upload') AND the
-- two legacy blank master templates (kind = 'org_doc:Rate Confirmation' /
-- 'org_doc:Bill of Lading', account_id/deal_id both null). The templates are
-- NOT a separate table or a filesystem convention; they are ordinary
-- crm_documents rows read by listBlankTemplates(). So one column covers
-- everything the tab shows, and the toggle + the Operations filter behave
-- identically for every card.
--
-- DEFAULT FALSE, deliberately: a newly uploaded document is private until an
-- admin publishes it. Nothing a sales agent can reach ever appears without an
-- explicit decision, which is the safe direction for insurance certs, W9s and
-- signed agreements.
--
-- NOT NULL + default false also means no code path has to handle a null: the
-- app reads `is_public` as a plain boolean everywhere.
--
-- NOT YET APPLIED TO PROD — committed so the schema is tracked, but per this
-- repo's "no schema without asking" convention it is applied by hand
-- (Supabase SQL editor / MCP) before the code that reads it is relied on.
--
-- Idempotent: `add column if not exists`.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.crm_documents
  add column if not exists is_public boolean not null default false;

-- Partial index for the Operations read path, which is always
-- "public org-level documents of one kind, newest first".
create index if not exists crm_documents_public_org_doc_idx
  on public.crm_documents (org_id, created_at desc)
  where is_public and account_id is null and deal_id is null and deleted_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL — RUN SEPARATELY. Intentionally NOT executed by this migration,
-- same convention as crm_bol_entries' seed rows: a data change that decides
-- what sales agents can see should be applied deliberately and reviewed, not
-- ride along with a schema change.
--
-- Brent's rule: every document that exists TODAY is public, EXCEPT the two
-- blank master templates, which stay off.
--
-- The two templates are identified BY `kind`, never by file_name —
-- renameOrgDocument() lets an admin retitle a template (file_name is
-- editable for template rows too), while `kind` is never updated by any code
-- path in the app. kind is the stable discriminator.
--
--   update public.crm_documents
--      set is_public = (kind = 'org_doc:upload')
--    where kind in (
--            'org_doc:upload',
--            'org_doc:Rate Confirmation',
--            'org_doc:Bill of Lading'
--          )
--      and account_id is null
--      and deal_id is null
--      and deleted_at is null;
--
-- Soft-deleted rows are left at the default false on purpose: if one is ever
-- restored it comes back private rather than silently republished.
-- ─────────────────────────────────────────────────────────────────────────────
