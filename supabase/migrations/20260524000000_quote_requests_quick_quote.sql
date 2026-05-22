-- 20260524000000_quote_requests_quick_quote.sql
-- Phase 2A: add lane + pickup-date columns so the public /quote form can
-- capture the Quick Quote payload (Pickup ZIP, Delivery ZIP, Target pickup
-- date) in addition to the existing name/phone/email/commodity/weight/notes.
--
-- All three columns are NULLABLE on purpose:
--   - existing rows have no values for them
--   - Quick Quote form may submit without a target date if the customer
--     says "ASAP" or leaves it blank
--   - server-side validation makes them required at the form layer, not
--     the DB layer, so future intake variations (e.g. inbound from
--     phone-call leads typed into admin) don't break
--
-- No RLS policy changes:
--   - service-role queries from server code bypass RLS as before
--   - the existing "anon can insert quote requests" policy continues to
--     accept inserts with these new columns set

alter table public.quote_requests
  add column if not exists pickup_zip   text,
  add column if not exists delivery_zip text,
  add column if not exists pickup_date  date;

-- No indexes added. Lane-based queries are admin-only (small table,
-- service-role) and don't justify column-level indexes yet.
