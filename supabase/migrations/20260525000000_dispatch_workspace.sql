-- 20260525000000_dispatch_workspace.sql
-- Phase 3A — Dispatch Response Workspace.
--
-- Adds three data structures so the admin quote detail page can become
-- a real dispatch workspace:
--
--   1. `quote_requests.lead_status` — 5-state operational status
--      (new → engaged → booking → confirmed → archived). Plus a
--      `lead_status_updated_at` so we can show "engaged 12m ago" etc.
--
--   2. `dispatch_estimates` — Brent's rate-range estimate for a lead.
--      One draft per quote_request (enforced by a partial unique index).
--      Once sent (sent_at is set) the row becomes the historical record;
--      a new draft can then start. NOT a formal PDF quote — that flow
--      stays in `generated_quotes`. This is the "first reply" artifact.
--
--   3. `dispatch_events` — immutable communication timeline. Captures
--      every operational moment for a lead: receipt, ack sent, dispatch
--      alert sent, status changes, estimate drafts saved/sent, manual
--      notes Brent types, PDF generated, etc. Append-only.
--
-- No RLS policy changes for anon — service-role queries (server actions
-- + API routes) bypass RLS as designed everywhere else in this codebase.

-- ----- 1. lead_status on quote_requests --------------------------------

alter table public.quote_requests
  add column if not exists lead_status text not null default 'new',
  add column if not exists lead_status_updated_at timestamptz;

-- Constrain values. Adding the constraint as NOT VALID first then
-- VALIDATEing is the safer pattern on tables with existing rows, but
-- the new column already has a default of 'new' so every row satisfies
-- the constraint immediately. A plain constraint is fine.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quote_requests_lead_status_check'
  ) then
    alter table public.quote_requests
      add constraint quote_requests_lead_status_check
      check (lead_status in ('new','engaged','booking','confirmed','archived'));
  end if;
end $$;

create index if not exists quote_requests_lead_status_idx
  on public.quote_requests (lead_status)
  where deleted_at is null;

-- ----- 2. dispatch_estimates -------------------------------------------

create table if not exists public.dispatch_estimates (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null
    references public.quote_requests(id) on delete cascade,

  -- Rate range. linehaul_high is optional — Brent may quote a single
  -- number rather than a range for a known lane.
  linehaul_low numeric(10,2),
  linehaul_high numeric(10,2),

  -- Lane context the system calculated (or Brent overrode).
  miles_estimate integer,        -- driving-miles approximation
  rpm_low numeric(6,2),
  rpm_high numeric(6,2),

  -- Operational notes that will appear in the customer email.
  pickup_timing_notes text,
  equipment_notes text,

  -- Internal-only notes. NEVER appear in the customer email.
  dispatch_notes text,

  -- Validity window for the estimate.
  expiration_at date,

  -- Send tracking. Null = draft. Non-null = sent (immutable thereafter).
  sent_at timestamptz,
  sent_email_id text,            -- Resend message ID

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dispatch_estimates_quote_request_id_idx
  on public.dispatch_estimates (quote_request_id, created_at desc);

-- Only ONE draft per quote_request at a time. Once that draft is sent
-- (sent_at filled), a new draft row can be inserted.
create unique index if not exists dispatch_estimates_one_draft_per_request
  on public.dispatch_estimates (quote_request_id)
  where sent_at is null;

alter table public.dispatch_estimates enable row level security;
-- No anon policies. Service-role only.

-- ----- 3. dispatch_events (communication timeline) ---------------------

create table if not exists public.dispatch_events (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null
    references public.quote_requests(id) on delete cascade,

  -- Event kind. Kept as text instead of an enum so adding a new kind
  -- doesn't require a migration. Known values:
  --   'lead_received'        — Quick Quote submitted
  --   'ack_sent'             — customer acknowledgement email sent
  --   'ack_failed'           — acknowledgement email failed to send
  --   'dispatch_alert_sent'  — internal notification email sent
  --   'dispatch_alert_failed'— internal notification email failed
  --   'status_changed'       — lead_status transition
  --   'estimate_draft_saved' — Brent saved a draft estimate
  --   'estimate_sent'        — estimate emailed to customer
  --   'estimate_send_failed' — estimate email failed
  --   'pdf_generated'        — formal generated_quotes PDF created
  --   'note'                 — manual operational note Brent typed
  kind text not null,

  -- Kind-specific structured payload. e.g. { "from": "new", "to": "engaged" }
  -- for status_changed, or { "subject": "...", "emailId": "..." } for sends.
  payload jsonb,

  created_at timestamptz not null default now()
);

create index if not exists dispatch_events_quote_request_id_idx
  on public.dispatch_events (quote_request_id, created_at desc);

alter table public.dispatch_events enable row level security;
-- No anon policies. Service-role only.

-- ----- updated_at trigger for dispatch_estimates -----------------------

-- Auto-touch updated_at on UPDATE so the row reflects the last edit time
-- without callers having to remember to set it.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dispatch_estimates_touch_updated_at on public.dispatch_estimates;
create trigger dispatch_estimates_touch_updated_at
  before update on public.dispatch_estimates
  for each row execute function public.touch_updated_at();
