-- 20260539000000_intake_date_windows.sql
-- Customer intake UX upgrade — date-window start/end + appointment status.
--
-- Replaces the single free-text pickup_window / delivery_window fields
-- in the customer experience with paired calendar inputs. The legacy
-- pickup_window / delivery_window text columns are KEPT — server actions
-- continue to populate them with a derived "{start} – {end}" string so
-- email renderers, admin Load Details, the Finalized Quote workspace,
-- and any other downstream consumers that read the text form keep
-- working unchanged.
--
-- Columns added (all nullable so existing rows aren't disturbed):
--   pickup_window_start    date  — calendar day the shipper has freight ready
--   pickup_window_end      date  — last day shipper can release the freight
--   delivery_window_start  date  — earliest delivery the receiver will accept
--   delivery_window_end    date  — latest delivery the receiver will accept
--   appointment_status     text  — one of:
--                                    'flexible'
--                                    'appointment_needed'
--                                    'already_scheduled'
--                                    'call_to_schedule'
--                                    or NULL (not yet answered)
--
-- We intentionally don't store exact times. Real dispatch confirms
-- exact times by phone after intake/payment — the customer form just
-- captures the date window and the scheduling posture.

alter table public.shipment_intake
  add column if not exists pickup_window_start date,
  add column if not exists pickup_window_end date,
  add column if not exists delivery_window_start date,
  add column if not exists delivery_window_end date,
  add column if not exists appointment_status text;

-- Soft constraint via CHECK rather than a foreign-keyed enum so legacy
-- rows with NULL keep validating cleanly and a typo at the API layer
-- can never bypass it. Allows NULL so a customer who hasn't answered
-- yet doesn't have to.
alter table public.shipment_intake
  drop constraint if exists shipment_intake_appointment_status_check;
alter table public.shipment_intake
  add constraint shipment_intake_appointment_status_check
  check (
    appointment_status is null
    or appointment_status in (
      'flexible',
      'appointment_needed',
      'already_scheduled',
      'call_to_schedule'
    )
  );

-- End >= start, validated only when both are present.
alter table public.shipment_intake
  drop constraint if exists shipment_intake_pickup_window_order_check;
alter table public.shipment_intake
  add constraint shipment_intake_pickup_window_order_check
  check (
    pickup_window_start is null
    or pickup_window_end is null
    or pickup_window_end >= pickup_window_start
  );

alter table public.shipment_intake
  drop constraint if exists shipment_intake_delivery_window_order_check;
alter table public.shipment_intake
  add constraint shipment_intake_delivery_window_order_check
  check (
    delivery_window_start is null
    or delivery_window_end is null
    or delivery_window_end >= delivery_window_start
  );
