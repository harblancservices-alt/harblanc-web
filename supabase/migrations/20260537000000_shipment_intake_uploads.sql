-- 20260537000000_shipment_intake_uploads.sql
-- Customer-uploaded supporting documents + photos for the shipment
-- intake workflow.
--
-- Customer flow: after accepting a quote range, the customer opens
-- /quote/accept/[token] and can upload supporting files alongside the
-- intake form. Uploaded files belong to a quote_request (the durable
-- entity) and reference the dispatch_estimate that issued the
-- acceptance token. The shipment_intake row is created on first save
-- of intake fields, so we keep that FK nullable — uploads can land
-- before the intake row exists.
--
-- Storage:
--   Files live in a NEW private bucket `intake-uploads`. Bucket
--   allows the customer-facing mime types only (images + pdf). No
--   doc/docx for now — those require server-side scanning that is
--   out of scope.
--   Service-role uploads only (no anon policies); admins view via
--   signed URLs.
--
-- Path convention:
--   {quote_request_id}/{uuid}-{sanitized_filename}
--   Bucket scope is the lead, so cascade delete of a quote_request
--   cleans up the row but not the bucket object — a future cleanup
--   job (or storage retention policy) handles orphaned objects.

create table if not exists public.shipment_intake_uploads (
  id uuid primary key default gen_random_uuid(),

  -- Lead is the durable parent. Permanent-delete of a quote_request
  -- removes the upload row; bucket object cleanup is handled out of
  -- band.
  quote_request_id uuid not null
    references public.quote_requests(id) on delete cascade,

  -- The estimate whose accept_token authorized this upload. Lets the
  -- admin trace which Send produced the document set.
  dispatch_estimate_id uuid
    references public.dispatch_estimates(id) on delete set null,

  -- The intake row, if it exists at upload time. Customers can upload
  -- before saving any intake field, so this stays nullable.
  shipment_intake_id uuid
    references public.shipment_intake(id) on delete set null,

  -- Storage bookkeeping.
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),

  -- Optional customer-supplied note (e.g. "tarp side", "shipper paperwork").
  note text,

  -- Audit: which token issued this upload. Same accept_token used to
  -- resolve the page. Stored for traceability; do not display to the
  -- customer.
  uploaded_via_token text,

  created_at timestamptz not null default now()
);

create index if not exists shipment_intake_uploads_quote_request_id_idx
  on public.shipment_intake_uploads (quote_request_id);

create index if not exists shipment_intake_uploads_dispatch_estimate_id_idx
  on public.shipment_intake_uploads (dispatch_estimate_id);

create index if not exists shipment_intake_uploads_storage_path_idx
  on public.shipment_intake_uploads (storage_path);

alter table public.shipment_intake_uploads enable row level security;
-- No anon policies. Customer-facing upload action uses service-role
-- gated by accept_token, mirroring the rest of the intake actions.

-- Private storage bucket for customer-uploaded intake documents.
-- Allowed mime types intentionally narrow — images + pdf only. Doc
-- formats can be added later behind server-side validation.
insert into storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
values (
  'intake-uploads',
  'intake-uploads',
  false,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ],
  -- 15 MB per file. Generous for phone photos + most paperwork PDFs;
  -- tight enough to bound storage on a single quote's upload set.
  15728640
)
on conflict (id) do nothing;
