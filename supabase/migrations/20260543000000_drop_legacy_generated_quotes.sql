-- 20260543000000_drop_legacy_generated_quotes.sql
-- Remove the dead Phase 1 "Premium Carrier Quote" PDF pathway.
--
-- The generated_quotes table was superseded by the dispatch_estimates
-- (range proposal) -> finalized_quotes -> bills_of_lading flow, which is
-- email-based. Nothing in the app reads generated_quotes, the generateQuote
-- server action is orphaned, and the table holds zero rows. Safe to drop.

-- 1. Table (cascades to its indexes; FK to quote_requests is ON DELETE CASCADE
--    on the child side, so no dependents block this).
drop table if exists public.generated_quotes;

-- 2. Number generator + sequence (only the dropped table referenced them).
drop function if exists public.next_quote_number();
drop sequence if exists public.generated_quotes_number_seq;

-- 3. The private "quotes" storage bucket (empty; no objects ever written) is
--    removed via the Storage API, not SQL -- Supabase blocks direct deletes
--    from storage.buckets (storage.protect_delete) to prevent orphaning data.
--    Removed out-of-band against the live project; nothing else references it.
