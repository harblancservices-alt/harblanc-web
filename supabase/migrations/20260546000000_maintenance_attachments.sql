-- 20260546000000_maintenance_attachments.sql
-- "Add Service" flow: custom/ad-hoc services + receipt uploads.
--
-- The backend is already applied on the live DB; this file is a repo record.
-- IF NOT EXISTS / idempotent guards make it a no-op against the live schema.
-- The private `maintenance-receipts` storage bucket is created outside SQL
-- migrations (Storage admin), and is accessed server-side with signed URLs.

-- A log row can now be a custom service (item_id null) carrying a typed name.
alter table public.maintenance_log
  add column if not exists service_name text;
alter table public.maintenance_log
  alter column item_id drop not null;

-- Receipt files (photos / PDFs) attached to a logged service.
create table if not exists public.maintenance_attachments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  log_id uuid not null references public.maintenance_log(id) on delete cascade,
  file_path text not null,
  file_name text,
  content_type text,
  size_bytes bigint
);

-- Service-role only (admin server actions); RLS on with no policy = deny all.
alter table public.maintenance_attachments enable row level security;

create index if not exists maintenance_attachments_log_idx
  on public.maintenance_attachments (log_id);
