-- 20260549000000_backhaul_contact_and_payment_method.sql
-- Two additive flags/fields (already applied on the live DB; this file is a
-- repo record — IF NOT EXISTS makes it a no-op against the live schema).
--
-- 1. broker_contacts.is_backhaul — marks a contact as a backhaul/dispatch
--    contact. Only flagged contacts feed the Backhaul recipient list and show
--    the lane-overview affordance; general contacts (e.g. a caller-ID-only
--    dispatcher) are plain contacts. Existing contacts WITH an email were
--    backfilled to true to preserve prior behavior.
-- 2. maintenance_log.payment_method — how a service was paid (Cash / Credit /
--    Debit / Check / Other), for the spend rundown.

alter table public.broker_contacts
  add column if not exists is_backhaul boolean not null default false;

alter table public.maintenance_log
  add column if not exists payment_method text;
