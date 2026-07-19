-- 20260715000000_camera_batches.sql
-- Camera feature: rapid photographing of paper documents (BOLs) into
-- batches that can be reopened and exported (combined PDF / image ZIP) to
-- send to a sales rep.
--
-- Two tables:
--   camera_batches  — a named collection of shots (id, name, created_at).
--   camera_photos   — one row per captured/uploaded still, ordered within
--                     the batch by `seq` (monotonic capture order). Display
--                     names ("BOL-001", "BOL-002", …) are computed from the
--                     ordered position at render/export time, so deleting a
--                     bad shot renumbers the rest and stays contiguous.
--
-- Storage:
--   Photos REUSE the existing private `load-documents` bucket (the same
--   bucket the BOL/POD/rate-con uploads use — images + pdf, 15 MB limit).
--   No new bucket is created. Path convention keeps camera shots namespaced
--   away from load docs:
--       camera/{batch_id}/{uuid}.jpg
--   Service-role uploads only, mirroring the rest of the document plumbing.
--
-- Security:
--   RLS ENABLED, NO POLICIES on both tables — deny-all to anon/auth. Every
--   read/write goes through service-role server actions behind the authed
--   admin shell, matching load_documents / shipment_intake_uploads / etc.

create table if not exists public.camera_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.camera_photos (
  id uuid primary key default gen_random_uuid(),

  batch_id uuid not null
    references public.camera_batches(id) on delete cascade,

  -- Path within the `load-documents` bucket (camera/{batch_id}/{uuid}.jpg).
  storage_path text not null,

  mime_type text not null default 'image/jpeg',
  size_bytes bigint not null check (size_bytes > 0),

  -- Monotonic capture order within the batch. Sort key only — the display
  -- name is the 1-based ORDINAL position after sorting, so numbering stays
  -- contiguous when a shot is deleted.
  seq integer not null,

  created_at timestamptz not null default now()
);

create index if not exists camera_photos_batch_id_seq_idx
  on public.camera_photos (batch_id, seq);

create index if not exists camera_batches_created_at_idx
  on public.camera_batches (created_at desc);

alter table public.camera_batches enable row level security;
alter table public.camera_photos enable row level security;
-- No policies. Deny-all to anon/auth; service-role server actions only.
