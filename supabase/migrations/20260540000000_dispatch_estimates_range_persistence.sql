-- 20260540000000_dispatch_estimates_range_persistence.sql
-- Phase REBUILD-3 — extend dispatch_estimates so the Quote Range workspace
-- preserves every operator-entered field across navigation and refresh.
--
-- Until this migration the persisted columns covered linehaul (low/high),
-- miles_estimate, RPM, timing/equipment/dispatch notes, expiration, and
-- closing line. Fuel surcharge, accessorial line items, payment terms, and
-- the free-text special instructions field were ONLY baked into the rendered
-- preview_html / preview_text snapshots at build time, never as columns.
-- That meant: if the operator typed values, navigated to /admin and back,
-- or refreshed the page, those four fields were gone.
--
-- This migration adds the missing columns so the workspace can hydrate from
-- the draft row on page load. The new columns are all nullable / default-
-- null so existing rows continue to work; the workspace falls back to its
-- built-in empty defaults when the column is null.
--
-- Columns:
--   fuel_surcharge       numeric(10,2)  Dollar amount, same shape as
--                                       linehaul_low / linehaul_high. Null
--                                       means "operator never entered a
--                                       fuel surcharge for this estimate."
--   accessorials         jsonb          Array of {label: text, amount: number}.
--                                       JSONB so we can grow the per-line
--                                       fields later (units, taxable, etc.)
--                                       without another migration. Null vs
--                                       empty array both mean "no lines";
--                                       the workspace coalesces.
--   payment_terms        text           Free-text term (Prepay / Net 7 /
--                                       Net 15 / Net 30). Existing rows have
--                                       this baked into preview_html only.
--   special_instructions text           Free-text customer-facing notes
--                                       displayed under the rate-block in
--                                       the email. Distinct from
--                                       dispatch_notes (which are internal).

alter table public.dispatch_estimates
  add column if not exists fuel_surcharge numeric(10, 2),
  add column if not exists accessorials jsonb,
  add column if not exists payment_terms text,
  add column if not exists special_instructions text;

comment on column public.dispatch_estimates.fuel_surcharge is
  'Operator-entered fuel surcharge in USD. NULL = not set (workspace renders empty input).';
comment on column public.dispatch_estimates.accessorials is
  'JSONB array of {label, amount} line items. NULL or [] = no accessorials.';
comment on column public.dispatch_estimates.payment_terms is
  'Free-text payment terms (Prepay / Net 7 / Net 15 / Net 30 / Quick pay).';
comment on column public.dispatch_estimates.special_instructions is
  'Customer-facing special instructions surfaced under the rate block in the range email.';
