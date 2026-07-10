-- 20260710000000_bol_signatures.sql
-- Two-signature BOLs (Receiver + Carrier). The ORIGINAL unsigned BOL is never
-- modified; each role's finger signature (trimmed PNG data URL) plus its
-- placement (page + coordinates + width + print name + date) is stored here,
-- keyed by (original BOL doc, role). The signed "— signed.pdf" output is always
-- REGENERATED from the original + every current role row, so re-signing one
-- role replaces only that row and re-stamps both — reliable, filename-free.
--
-- Apply against the live DB. IF NOT EXISTS makes re-runs a no-op.

create table if not exists public.bol_signatures (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads(id) on delete cascade,
  doc_id uuid not null references public.load_documents(id) on delete cascade,
  role text not null check (role in ('receiver', 'carrier')),
  png text not null,
  placement jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doc_id, role)
);

create index if not exists bol_signatures_load_id_idx
  on public.bol_signatures (load_id);
create index if not exists bol_signatures_doc_id_idx
  on public.bol_signatures (doc_id);

-- Link a generated signed BOL back to the original it was stamped from, so we
-- can find/replace it and show role state without reading the filename.
alter table public.load_documents
  add column if not exists signed_from_doc_id uuid
    references public.load_documents(id) on delete cascade;

create index if not exists load_documents_signed_from_idx
  on public.load_documents (signed_from_doc_id);
