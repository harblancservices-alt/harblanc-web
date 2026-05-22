-- 20260531000000_bills_of_lading.sql
-- Phase 5B — Bill of Lading (BOL) execution paperwork.
--
-- A third, distinct document class. Conceptually:
--
--   dispatch_estimates  → "Range Proposal"           — pricing direction
--   finalized_quotes    → "Finalized Quote / RC"     — commercial agreement
--   bills_of_lading     → "Bill of Lading"           — execution paperwork  <-- THIS FILE
--
-- The BOL is downstream from the commercial agreement. It's carrier
-- shipment paperwork — what physically rides with the freight and
-- gets signed by shipper / driver / consignee. It is NOT a pricing
-- document and MUST NOT be merged into the finalized_quote layer.
--
-- Same architecture as the finalized_quotes layer:
--   - One DRAFT per finalized_quote at a time (partial unique index)
--   - Sent rows are unconstrained → re-issues live alongside originals
--   - Preview snapshot columns (preview/send byte parity)
--   - Cascade delete from quote_requests AND finalized_quotes so
--     permanently deleting either takes the BOL history with it

-- ----- Monotonic BOL number sequence ------------------------------------
--
-- Format: BOL-YYYY-NNNN  (e.g. BOL-2026-0042). Deliberately distinct
-- from HS- (legacy generated_quotes) and RC- (finalized_quotes) so a
-- glance at the number tells you which document class you're looking
-- at. Sequence does not reset per year — continuous numbering matches
-- standard carrier paperwork conventions.

create sequence if not exists public.bills_of_lading_number_seq;

create or replace function public.next_bol_number()
returns text
language plpgsql
as $$
declare
  yr text := to_char(now(), 'YYYY');
  n int := nextval('public.bills_of_lading_number_seq');
begin
  return 'BOL-' || yr || '-' || lpad(n::text, 4, '0');
end;
$$;

-- ----- bills_of_lading --------------------------------------------------

create table if not exists public.bills_of_lading (
  id uuid primary key default gen_random_uuid(),

  -- Context. Carry refs to the lead, the estimate, and the finalized
  -- quote so cascade delete from any of those three takes the BOL with
  -- it cleanly, and so a single-row read from any direction works.
  quote_request_id uuid not null
    references public.quote_requests(id) on delete cascade,
  dispatch_estimate_id uuid not null
    references public.dispatch_estimates(id) on delete cascade,
  finalized_quote_id uuid not null
    references public.finalized_quotes(id) on delete cascade,

  -- Identifiers
  bol_number text not null unique
    default public.next_bol_number(),
  dispatch_reference text,             -- e.g. HS-A4F2-9B1C (lead ref)
  issue_date date not null default (now() at time zone 'utc')::date,

  -- ----- Shipper (a.k.a. pickup origin) -------------------------------
  shipper_company text,
  shipper_contact_name text,
  shipper_contact_phone text,
  shipper_contact_email text,
  shipper_address_line1 text,
  shipper_address_line2 text,
  shipper_city text,
  shipper_state text,
  shipper_zip text,
  pickup_window text,
  pickup_instructions text,

  -- ----- Consignee (delivery destination) -----------------------------
  consignee_company text,
  consignee_contact_name text,
  consignee_contact_phone text,
  consignee_contact_email text,
  consignee_address_line1 text,
  consignee_address_line2 text,
  consignee_city text,
  consignee_state text,
  consignee_zip text,
  delivery_window text,
  delivery_instructions text,

  -- ----- Freight description ------------------------------------------
  commodity text,
  quantity integer,                    -- count of handling units
  handling_units_type text,            -- e.g. "Skids", "Crates", "Pieces"
  length_in numeric(8,2),
  width_in numeric(8,2),
  height_in numeric(8,2),
  weight_lbs numeric(10,2),
  nmfc_code text,                      -- optional, placeholder if unknown
  freight_class text,                  -- optional, e.g. "70", "85"
  hazmat boolean not null default false,
  special_handling text,

  -- ----- Operational handling -----------------------------------------
  --
  -- Mirrors the finalized_quote ops block. Booleans, not tri-state —
  -- by the time we're generating a BOL the answers are knowable.
  driver_assist_required boolean not null default false,
  tarp_required boolean not null default false,
  permits_required boolean not null default false,
  escort_required boolean not null default false,
  rigging_required boolean not null default false,
  appointment_required boolean not null default false,
  special_instructions text,

  -- ----- Execution notes ----------------------------------------------
  --
  -- pickup_instructions / delivery_instructions live under the location
  -- blocks above. dispatch_notes is the catch-all for anything the
  -- driver / dispatch needs that doesn't fit elsewhere. Renders as a
  -- separate block on the BOL.
  dispatch_notes text,

  -- ----- Prepared by --------------------------------------------------
  prepared_by text,

  -- ----- Preview snapshot (preview/send byte parity) ------------------
  --
  -- Send reads these columns back verbatim. preview_built_at being
  -- non-null is the gate for Send. Same pattern as finalized_quotes
  -- and dispatch_estimates.
  preview_subject text,
  preview_preheader text,
  preview_html text,
  preview_text text,
  preview_to text,
  preview_from text,
  preview_reply_to text,
  preview_built_at timestamptz,

  -- ----- Send tracking -------------------------------------------------
  -- Null = draft. Non-null = sent (immutable thereafter).
  sent_at timestamptz,
  sent_email_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----- Indexes ----------------------------------------------------------

create index if not exists bills_of_lading_quote_request_id_idx
  on public.bills_of_lading (quote_request_id, created_at desc);

create index if not exists bills_of_lading_finalized_quote_id_idx
  on public.bills_of_lading (finalized_quote_id, created_at desc);

create unique index if not exists bills_of_lading_number_uidx
  on public.bills_of_lading (bol_number);

-- One DRAFT per finalized_quote at a time. Sent rows are unconstrained
-- so the historical record can grow without bound (re-issues live
-- alongside originals).
create unique index if not exists bills_of_lading_one_draft_per_finalized_quote
  on public.bills_of_lading (finalized_quote_id)
  where sent_at is null;

-- ----- RLS --------------------------------------------------------------

alter table public.bills_of_lading enable row level security;
-- No anon policies. Service-role only.

-- ----- updated_at trigger -----------------------------------------------
--
-- Reuse the touch_updated_at function created in
-- 20260525000000_dispatch_workspace.sql.

drop trigger if exists bills_of_lading_touch_updated_at on public.bills_of_lading;
create trigger bills_of_lading_touch_updated_at
  before update on public.bills_of_lading
  for each row execute function public.touch_updated_at();
