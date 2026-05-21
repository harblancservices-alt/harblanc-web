-- 20260520120000_quote_requests.sql
-- Initial quote requests table for the public /quote form.
-- Anonymous users may INSERT only (via the /api/quote route).
-- No SELECT/UPDATE/DELETE policies exist for anon or authenticated,
-- so rows are only readable via the service role (server-side).

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text not null,
  commodity text not null,
  weight text not null,
  notes text,
  -- minimal request metadata for triage / abuse signals
  user_agent text,
  ip text
);

alter table public.quote_requests enable row level security;

-- Anon role may insert; that is the only grant.
drop policy if exists "anon can insert quote requests" on public.quote_requests;
create policy "anon can insert quote requests"
  on public.quote_requests
  for insert
  to anon
  with check (true);

-- Index for recency-sorted admin views (built in a later phase).
create index if not exists quote_requests_created_at_idx
  on public.quote_requests (created_at desc);

-- NOTE: no select/update/delete policies are created.
-- The PostgREST anon role therefore cannot read this table.
-- Service-role queries from server code bypass RLS as designed.
