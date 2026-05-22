-- 20260528000000_estimate_accept_decline_intake.sql
-- Interactive quote acceptance workflow.
--
-- Adds:
--   1. Per-estimate accept_token + accepted_at / declined_at / declined_reason
--      so the email's Accept and Decline buttons can land on a public,
--      tokenized URL without exposing the underlying estimate UUID.
--
--   2. shipment_intake — the customer-facing finalization record that
--      collects pickup/delivery addresses, contacts, appointment windows,
--      dimensions, exact weight, loading/unloading responsibility, links,
--      and notes. One row per dispatch_estimate. Cascade delete from the
--      estimate (which itself cascade-deletes from quote_requests) so
--      permanently deleting the quote removes the entire intake history.
--
-- Token format: 32 hex chars from gen_random_uuid()::text with hyphens
-- stripped. Long enough that guessing is impractical, short enough that
-- the URL still reads as a real reference number.

-- ----- 1. Estimate-side acceptance fields ------------------------------

alter table public.dispatch_estimates
  add column if not exists accept_token text
    default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists accepted_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists declined_reason text;

-- Backfill tokens for existing rows so historical Accept / Decline
-- links remain operable. Only rows that lack a token get one. New rows
-- pick up the default automatically — Build Preview and Send therefore
-- share the same token, which preserves preview/send byte parity.
update public.dispatch_estimates
  set accept_token = replace(gen_random_uuid()::text, '-', '')
  where accept_token is null;

create unique index if not exists dispatch_estimates_accept_token_uidx
  on public.dispatch_estimates (accept_token)
  where accept_token is not null;

-- ----- 2. shipment_intake -----------------------------------------------

create table if not exists public.shipment_intake (
  id uuid primary key default gen_random_uuid(),
  dispatch_estimate_id uuid not null
    references public.dispatch_estimates(id) on delete cascade,

  -- Pickup
  pickup_company text,
  pickup_contact_name text,
  pickup_contact_phone text,
  pickup_contact_email text,
  pickup_address_line1 text,
  pickup_address_line2 text,
  pickup_city text,
  pickup_state text,
  pickup_zip text,
  pickup_window text,

  -- Delivery
  delivery_company text,
  delivery_contact_name text,
  delivery_contact_phone text,
  delivery_contact_email text,
  delivery_address_line1 text,
  delivery_address_line2 text,
  delivery_city text,
  delivery_state text,
  delivery_zip text,
  delivery_window text,

  -- Shipment details
  commodity_details text,
  length_in numeric(8,2),
  width_in numeric(8,2),
  height_in numeric(8,2),
  exact_weight_lbs numeric(10,2),

  -- Logistics
  loading_responsibility text,    -- e.g. "driver", "shipper-forklift", "dock"
  unloading_responsibility text,
  special_requirements text,      -- escorts, permits, hand-unload, etc.

  -- Free-form
  reference_links text,           -- newline-separated URLs (no upload bucket yet)
  notes text,

  status text not null default 'in_progress'
    check (status in ('in_progress','submitted')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz
);

-- Only one intake row per estimate. Save Progress UPSERTs into this row;
-- Submit flips status. Keeping it a single row makes the customer-side
-- token lookup trivial (no need to pick the "latest" attempt).
create unique index if not exists shipment_intake_one_per_estimate
  on public.shipment_intake (dispatch_estimate_id);

alter table public.shipment_intake enable row level security;
-- No anon policies. Customer-facing route uses service-role lookups
-- gated by accept_token, the same way server actions reach the rest
-- of the dispatch tables.

-- Reuse the same touch_updated_at function created in
-- 20260525000000_dispatch_workspace.sql.
drop trigger if exists shipment_intake_touch_updated_at on public.shipment_intake;
create trigger shipment_intake_touch_updated_at
  before update on public.shipment_intake
  for each row execute function public.touch_updated_at();
