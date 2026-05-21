-- 20260521120000_applications.sql
-- Owner-operator applications table for the public /apply form.
-- Same RLS shape as quote_requests: anon may insert only, no read.

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  email text not null,
  equipment_type text not null,
  cdl_status text not null,
  years_experience text,
  home_base text,
  message text,
  -- minimal request metadata for triage / abuse signals
  user_agent text,
  ip text
);

alter table public.applications enable row level security;

-- Anon role may insert; that is the only grant.
drop policy if exists "anon can insert applications" on public.applications;
create policy "anon can insert applications"
  on public.applications
  for insert
  to anon
  with check (true);

-- Index for recency-sorted admin views (built in a later phase).
create index if not exists applications_created_at_idx
  on public.applications (created_at desc);

-- NOTE: no select/update/delete policies are created.
-- The PostgREST anon role therefore cannot read this table.
-- Service-role queries from server code bypass RLS as designed.
