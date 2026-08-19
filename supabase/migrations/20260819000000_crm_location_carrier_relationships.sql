-- 20260819000000_crm_location_carrier_relationships.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Active Customers -> Locations -> Load -> Carrier/Broker -> RC/BOL workstream.
--
-- NOT YET APPLIED TO PROD — must be applied by hand (Supabase MCP) BEFORE the
-- code that reads/writes these columns deploys. Idempotent (add column if not
-- exists), matching this repo's established migration convention, so it's
-- safe to run regardless of whether crm_account_locations/crm_shipments were
-- created via an earlier migration file or applied directly to the live DB
-- (both are true of different tables in this schema — see crm_details_
-- expansion.sql's own header note and the CRM's "verify migrations live"
-- lesson). Two pieces:
--
--   1. crm_account_locations gains a contact (name/phone/email) and a
--      "recurring carrier" relationship (default_carrier_id / default_
--      carrier_contact_id) — so picking a saved pickup/delivery location on a
--      shipment can auto-suggest the carrier/dispatcher that's normally used
--      there, same way it already auto-fills the address.
--   2. crm_shipments gains carrier_contact_id + a name/phone/email snapshot
--      (carrier_contact_*), mirroring the existing shipper_contact/
--      consignee_contact snapshot columns — the shipment now retains the
--      actual carrier contact used, instead of Rate Confirmation generation
--      having to guess the carrier's "oldest" contact row every time.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── crm_account_locations: contact + recurring carrier relationship ────────
alter table public.crm_account_locations add column if not exists contact_name text;
alter table public.crm_account_locations add column if not exists contact_phone text;
alter table public.crm_account_locations add column if not exists contact_email text;
alter table public.crm_account_locations add column if not exists default_carrier_id uuid references public.crm_carriers(id) on delete set null;
alter table public.crm_account_locations add column if not exists default_carrier_contact_id uuid references public.crm_carrier_contacts(id) on delete set null;

create index if not exists crm_account_locations_default_carrier_idx on public.crm_account_locations (default_carrier_id);

-- ── crm_shipments: carrier contact retained per-load (mirrors shipper_contact
--    / consignee_contact) ──────────────────────────────────────────────────
alter table public.crm_shipments add column if not exists carrier_contact_id uuid references public.crm_carrier_contacts(id) on delete set null;
alter table public.crm_shipments add column if not exists carrier_contact_name text;
alter table public.crm_shipments add column if not exists carrier_contact_phone text;
alter table public.crm_shipments add column if not exists carrier_contact_email text;
