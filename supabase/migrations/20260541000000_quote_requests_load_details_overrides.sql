-- 20260541000000_quote_requests_load_details_overrides.sql
-- Phase REBUILD-3 -- operator-side editable load details persistence.
--
-- The admin Load Details tab lets dispatch edit every field on the
-- card (company, address, city, ZIP, contact, phone, window, freight
-- description, etc.). Until this migration those edits lived only in
-- React state and evaporated on refresh.
--
-- This column stores the operator-side overrides as a JSON object
-- keyed by LoadDetailsInitial field names. On page load the server
-- spreads it on top of the computed-from-intake values so any field
-- the operator has touched reads back the operator's value.
--
-- Stored on quote_requests (not shipment_intake) so a save is possible
-- even before the customer has started intake -- some dispatch flows
-- want to pre-fill load details before sending the range proposal.
--
-- Shape (informal; not enforced by Postgres):
--   {
--     "pickup_company": "Rocky Mountain Machine Works",
--     "pickup_phone": "(303) 555-0144",
--     "delivery_window": "2026-06-11",
--     ...
--   }
-- Empty strings are kept verbatim (cleared by operator = stays cleared);
-- missing keys fall through to the computed value from intake.
--
-- NULL = "no operator edits saved yet" -- same behavior as missing keys.

alter table public.quote_requests
  add column if not exists load_details_overrides jsonb;

comment on column public.quote_requests.load_details_overrides is
  'Operator-side overrides for the admin Load Details tab. Keys map to LoadDetailsInitial fields. Layered on top of intake + Quick Quote data at render time.';
