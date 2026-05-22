-- 20260529000000_finalized_quotes.sql
-- Phase 5A — Finalized Quote / Rate Confirmation.
--
-- A second, distinct document class. Conceptually:
--
--   dispatch_estimates  → "Range Proposal"
--                          rough pricing, lane viability, engagement
--                          conversational, exploratory, NON-binding
--
--   finalized_quotes    → "Finalized Quote / Rate Confirmation"  <-- THIS FILE
--                          exact pricing, dispatch-confirmed scope,
--                          formal operational agreement
--                          generated AFTER shipment_intake.submitted
--                          NOT the BOL — BOL is a future, separate class
--
--   generated_quotes    → legacy Premium Carrier Quote PDF (Phase 1).
--                          Still used by the GenerateQuoteForm tab. We
--                          leave it alone — it predates this workflow.
--
-- Range Proposals and Finalized Quotes are different operational
-- artifacts. They MUST NOT share a row. Both records persist for
-- historical fidelity; a customer should be able to see both the
-- range they accepted AND the formal rate confirmation that followed.
--
-- One DRAFT finalized_quote per dispatch_estimate at any time (enforced
-- by a partial unique index on sent_at IS NULL). Once a draft is sent,
-- the row becomes immutable history and a new draft can be started.
-- Same pattern dispatch_estimates uses.

-- ----- Monotonic finalized-quote number sequence ------------------------
--
-- Format: RC-YYYY-NNNN  (e.g. RC-2026-0042)
-- "RC" = Rate Confirmation. Deliberately distinct from the existing
-- HS-YYYY-NNNN range that generated_quotes uses, so when a finalized
-- quote and a legacy generated_quote both exist for the same lead they
-- can never be confused at a glance. Sequence does not reset per year.

create sequence if not exists public.finalized_quotes_number_seq;

create or replace function public.next_finalized_quote_number()
returns text
language plpgsql
as $$
declare
  yr text := to_char(now(), 'YYYY');
  n int := nextval('public.finalized_quotes_number_seq');
begin
  return 'RC-' || yr || '-' || lpad(n::text, 4, '0');
end;
$$;

-- ----- finalized_quotes -------------------------------------------------

create table if not exists public.finalized_quotes (
  id uuid primary key default gen_random_uuid(),

  -- Context. The finalized quote belongs to a specific Range Proposal
  -- (estimate) AND the lead that estimate belongs to. We carry both
  -- so a single lead-scoped fetch can pull the row without a join,
  -- and so cascade delete from the lead removes everything cleanly.
  quote_request_id uuid not null
    references public.quote_requests(id) on delete cascade,
  dispatch_estimate_id uuid not null
    references public.dispatch_estimates(id) on delete cascade,

  -- Identifiers
  finalized_quote_number text not null unique
    default public.next_finalized_quote_number(),

  -- Issue / expiration / payment-due window. issue_date is filled at
  -- insert time and frozen; the email body reads from it. expiration_at
  -- is the operational acceptance deadline; payment_due_at is when the
  -- deposit/payment must be received.
  issue_date date not null default (now() at time zone 'utc')::date,
  expiration_at date,
  payment_due_at date,

  -- ----- Pickup snapshot (copied from intake at draft creation) --------
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
  pickup_loading_hours text,

  -- ----- Delivery snapshot --------------------------------------------
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
  delivery_receiving_hours text,

  -- ----- Freight details ----------------------------------------------
  commodity text,
  length_in numeric(8,2),
  width_in numeric(8,2),
  height_in numeric(8,2),
  exact_weight_lbs numeric(10,2),
  quantity integer,
  handling_type text,                -- e.g. "Crated", "Skidded", "Loose"
  running_condition text,            -- e.g. "Running", "Non-running", "N/A"
  securement_requirements text,

  -- ----- Operational requirements -------------------------------------
  forklift_available boolean,
  driver_assist_required boolean,
  crane_required boolean,
  permits_required boolean,
  escort_required boolean,
  tarp_required boolean,
  special_instructions text,

  -- ----- Pricing (exact, NOT range) -----------------------------------
  --
  -- Each pricing line is a separate column so dispatch can adjust them
  -- individually without having to maintain a free-form JSON. Custom
  -- accessorials still go in the jsonb array.
  linehaul numeric(12,2),
  fuel_surcharge numeric(12,2),
  permits_fee numeric(12,2),
  accessorials jsonb not null default '[]'::jsonb,
  total_amount numeric(12,2),

  detention_policy text,
  tonu_policy text,
  payment_instructions text,

  -- ----- Agreement language -------------------------------------------
  dispatch_confirmation_statement text,
  scheduling_statement text,
  acceptance_acknowledgement text,

  -- ----- Optional customer-facing acceptance token --------------------
  --
  -- Generated by default so a future "customer signs the rate
  -- confirmation" flow can land at /quote/confirm/<token>. NOT used by
  -- the admin Build Preview / Send workflow in this phase. Tokens are
  -- 32 hex chars from gen_random_uuid()::text with hyphens stripped.
  confirmation_token text
    default replace(gen_random_uuid()::text, '-', ''),
  confirmed_at timestamptz,

  -- ----- Preview snapshot (preview/send byte parity) -------------------
  --
  -- Send reads these columns back verbatim. preview_built_at being
  -- non-null is the gate for Send. Same pattern as dispatch_estimates.
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

  -- ----- Prepared by --------------------------------------------------
  prepared_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----- Indexes ----------------------------------------------------------

create index if not exists finalized_quotes_quote_request_id_idx
  on public.finalized_quotes (quote_request_id, created_at desc);

create index if not exists finalized_quotes_dispatch_estimate_id_idx
  on public.finalized_quotes (dispatch_estimate_id, created_at desc);

create unique index if not exists finalized_quotes_number_uidx
  on public.finalized_quotes (finalized_quote_number);

-- One DRAFT per dispatch_estimate at a time. Sent rows are unconstrained
-- so the historical record can grow without bound.
create unique index if not exists finalized_quotes_one_draft_per_estimate
  on public.finalized_quotes (dispatch_estimate_id)
  where sent_at is null;

create unique index if not exists finalized_quotes_confirmation_token_uidx
  on public.finalized_quotes (confirmation_token)
  where confirmation_token is not null;

-- ----- RLS --------------------------------------------------------------

alter table public.finalized_quotes enable row level security;
-- No anon policies. Service-role only (mirrors dispatch_estimates).

-- ----- updated_at trigger ----------------------------------------------
--
-- Reuse the touch_updated_at function created in
-- 20260525000000_dispatch_workspace.sql.

drop trigger if exists finalized_quotes_touch_updated_at on public.finalized_quotes;
create trigger finalized_quotes_touch_updated_at
  before update on public.finalized_quotes
  for each row execute function public.touch_updated_at();
