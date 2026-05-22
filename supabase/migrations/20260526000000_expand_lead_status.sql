-- 20260526000000_expand_lead_status.sql
-- Phase 4A — expand quote_requests.lead_status from 5 to 8 states.
--
-- Old set (Phase 3A): new / engaged / booking / confirmed / archived
-- New set (Phase 4A): new / contacted / estimate_sent / awaiting_confirmation
--                     / booked / dispatched / archived / lost
--
-- Mapped backfill preserves history meaning so existing rows still look
-- correct after the migration:
--   engaged   → estimate_sent          (auto-advance fired on estimate send)
--   booking   → awaiting_confirmation  (range accepted, working details)
--   confirmed → booked                 (formal PDF quote sent + acknowledged)
--   new       → new                    (unchanged)
--   archived  → archived               (unchanged)
--
-- Drop the constraint first, do the data migration, then add the
-- expanded constraint. Postgres can't have two CHECKs of the same
-- name, and the new constraint would reject existing 'engaged' rows
-- if added before the backfill.

alter table public.quote_requests
  drop constraint if exists quote_requests_lead_status_check;

update public.quote_requests
   set lead_status = 'estimate_sent'
 where lead_status = 'engaged';

update public.quote_requests
   set lead_status = 'awaiting_confirmation'
 where lead_status = 'booking';

update public.quote_requests
   set lead_status = 'booked'
 where lead_status = 'confirmed';

alter table public.quote_requests
  add constraint quote_requests_lead_status_check
  check (lead_status in (
    'new',
    'contacted',
    'estimate_sent',
    'awaiting_confirmation',
    'booked',
    'dispatched',
    'archived',
    'lost'
  ));

-- The lead_status partial index from Phase 3A is still valid — keep as is.
