-- 20260523000000_generated_quotes.sql
-- Phase 1 quote-generation system. Premium Carrier Quote PDF storage,
-- one generated quote per quote_request (revisions/versions land later).

-- Monotonic sequence for the HS-YYYY-NNNN quote number format.
-- Sequence does not reset per year — numbering is continuous, which is
-- the convention for most freight carriers.
create sequence if not exists public.generated_quotes_number_seq;

create or replace function public.next_quote_number()
returns text
language plpgsql
as $$
declare
  yr text := to_char(now(), 'YYYY');
  n int := nextval('public.generated_quotes_number_seq');
begin
  return 'HS-' || yr || '-' || lpad(n::text, 4, '0');
end;
$$;

create table if not exists public.generated_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid references public.quote_requests(id) on delete cascade,

  quote_number text not null unique default public.next_quote_number(),
  status text not null default 'draft',

  issued_at timestamptz not null default now(),
  expires_at timestamptz,

  -- Customer block (snapshot at generation time; may differ from quote_request)
  customer_name text,
  customer_contact text,
  customer_email text,
  customer_phone text,

  -- Lane block (operational pickup/delivery info)
  origin text,
  destination text,
  pickup_window text,
  delivery_window text,

  -- Shipment block
  commodity text,
  weight_lbs integer,
  pieces integer,
  equipment_type text,

  special_instructions text,

  -- Pricing (numeric with 2 decimal places for currency)
  linehaul numeric(12, 2),
  fuel_surcharge numeric(12, 2),
  accessorials jsonb not null default '[]'::jsonb,
  total_amount numeric(12, 2),

  payment_terms text default 'Net 30',
  terms_override text,

  prepared_by text,

  -- Stored as the bucket-relative path (e.g. 'HS-2026-0042.pdf').
  -- Signed URLs are generated on-demand server-side; no public storage URLs.
  pdf_storage_path text,
  pdf_generated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.generated_quotes enable row level security;

-- No anon access. Service-role bypasses RLS for server-side admin ops.

create index if not exists generated_quotes_quote_request_id_idx
  on public.generated_quotes (quote_request_id);

create index if not exists generated_quotes_quote_number_idx
  on public.generated_quotes (quote_number);

-- Private storage bucket for generated PDFs.
-- Service-role uploads via the JS client; admins view via signed URLs.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('quotes', 'quotes', false, ARRAY['application/pdf'])
on conflict (id) do nothing;
