-- 20260538000000_intake_uploads_source.sql
-- Track the origin of each customer upload so the admin Documents
-- area can label them ("Quick Quote" vs "Customer Intake") and so
-- downstream queries can filter by source.
--
-- Two values today:
--   quick_quote     — uploaded from the public Quick Quote form. Lead
--                     exists but no intake row yet; uploads land
--                     within a short window after lead creation.
--   customer_intake — uploaded from the token-gated /quote/accept/[token]
--                     intake page, after the customer accepted a quote
--                     range. This is what every existing row is.
--
-- Backfill: every existing row gets "customer_intake" because the
-- previous flow was the only way to create uploads.

alter table public.shipment_intake_uploads
  add column if not exists source text not null default 'customer_intake'
    check (source in ('quick_quote','customer_intake'));

-- Index for "show me everything from this lead, sorted by source" —
-- admin Documents area uses this to group/label uploads.
create index if not exists shipment_intake_uploads_source_idx
  on public.shipment_intake_uploads (quote_request_id, source);
