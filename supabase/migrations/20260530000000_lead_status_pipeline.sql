-- 20260530000000_lead_status_pipeline.sql
-- Phase 5B prep — extend the lead_status pipeline beyond the commercial
-- agreement and into shipment execution.
--
-- Existing states (from 20260526000000):
--   new, contacted, estimate_sent, awaiting_confirmation,
--   booked, dispatched, archived, lost
--
-- New execution states (this migration):
--   awaiting_payment      — finalized quote sent, waiting on deposit
--   ready_to_dispatch     — payment / deposit cleared, ready to lock
--   picked_up             — driver loaded at shipper
--   in_transit            — between pickup and delivery
--   delivered             — offloaded at consignee
--
-- "dispatched" already exists and sits BETWEEN ready_to_dispatch and
-- picked_up — it represents the moment the truck is locked / assigned
-- but hasn't physically loaded yet.
--
-- Resulting linear flow:
--   new → contacted → estimate_sent → awaiting_confirmation →
--   booked → awaiting_payment → ready_to_dispatch → dispatched →
--   picked_up → in_transit → delivered → archived
--
-- Transitions are NOT strictly enforced in SQL — real dispatch is
-- messier than a linear funnel — the check constraint only validates
-- the set of allowed values.

-- Drop and recreate the check constraint with the new value set.
alter table public.quote_requests
  drop constraint if exists quote_requests_lead_status_check;

alter table public.quote_requests
  add constraint quote_requests_lead_status_check
  check (lead_status in (
    'new',
    'contacted',
    'estimate_sent',
    'awaiting_confirmation',
    'booked',
    'awaiting_payment',
    'ready_to_dispatch',
    'dispatched',
    'picked_up',
    'in_transit',
    'delivered',
    'archived',
    'lost'
  ));
