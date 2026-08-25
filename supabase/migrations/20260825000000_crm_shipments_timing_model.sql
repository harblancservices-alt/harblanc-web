-- 20260825000000_crm_shipments_timing_model.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Separate DATE from TIME on a shipment's pickup and delivery stops, and make
-- the three real freight timing states — TBD / WINDOW / APPOINTMENT —
-- representable as themselves instead of being faked.
--
-- THE DEFECT THIS FIXES: pickup_at / delivery_at are timestamptz driven by an
-- <input type="datetime-local">, which only yields a value when BOTH the date
-- and the time segments are filled. A date without a time is therefore
-- impossible to store: an agent who knows the day but not the hour must invent
-- one or lose the day. With no appointment concept anywhere, agents have been
-- expressing appointments through the free-text window column — production
-- currently holds "08:00 - 08:00" and "08:30 - 08:30" (zero-length windows =
-- appointments) and "00:00 - 00:00" / "08:00 - 00:00" (midnight artifacts =
-- TBD or an abandoned second field). Four of the six distinct window values
-- ever stored are degenerate.
--
-- WHY A DATE COLUMN, NOT A TIMESTAMP: a calendar day is not an instant. Storing
-- "August 26" as a `date` is what allows it to exist with no time attached, and
-- it removes the timezone question entirely for the one value that has no
-- clock component. The app's existing Central-wall-clock ↔ UTC conversion
-- (_shell/format.ts) is NOT changed by this migration and is not the problem —
-- the previous audit confirmed that layer is correct.
--
-- WHY `time` FOR THE CLOCK VALUES: pickup/delivery times are wall-clock facility
-- times ("be there at 8:30"), which is exactly what the existing
-- pickup_window/delivery_window text already encodes ("08:00 - 09:00"). `time`
-- keeps that meaning, makes it sortable/comparable, and stops the app parsing
-- a formatted string back apart.
--
-- ONE ACTIVE INTERPRETATION PER STOP: the check constraints below make the
-- three modes mutually exclusive at the database level, so the contradiction
-- found in live data (delivery_at 08:00 AM while delivery_window said
-- 09:00–12:00) cannot be recreated in the new columns.
--
-- ADDITIVE ONLY — NOTHING IS REMOVED, RENAMED, OR REWRITTEN:
--   pickup_at, pickup_window, delivery_at, delivery_window are left exactly as
--   they are. No UPDATE, no backfill, no DROP. Every one of the 16 existing
--   shipment rows is untouched by this file, and every already-generated PDF
--   and doc_snapshot stays byte-identical. New columns land NULL on all
--   existing rows, which is the signal the application uses to fall back to
--   the legacy columns (see FALLBACK below).
--
-- NOT YET APPLIED TO PROD — committed so the schema is tracked, but per this
-- repo's "no schema without asking" convention it is applied by hand
-- (Supabase SQL editor / MCP) before the code that reads it is relied on.
-- This one is additionally gated: localhost points at the production project,
-- so it is not to be applied without explicit approval.
--
-- Idempotent throughout: `add column if not exists`, guarded constraint adds,
-- `create index if not exists`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Pickup ───────────────────────────────────────────────────────────────────
alter table public.crm_shipments
  add column if not exists pickup_date              date,
  add column if not exists pickup_timing_mode       text,
  add column if not exists pickup_appointment_time  time,
  add column if not exists pickup_window_start      time,
  add column if not exists pickup_window_end        time;

-- ── Delivery ─────────────────────────────────────────────────────────────────
alter table public.crm_shipments
  add column if not exists delivery_date              date,
  add column if not exists delivery_timing_mode       text,
  add column if not exists delivery_appointment_time  time,
  add column if not exists delivery_window_start      time,
  add column if not exists delivery_window_end        time;

-- ── Constraints ──────────────────────────────────────────────────────────────
-- Guarded adds so the file is safe to re-run. NOT VALID is deliberately NOT
-- used: every existing row has NULL in all ten new columns, so each constraint
-- is already satisfied and validates instantly against current data.
do $$
begin
  -- Mode vocabulary. NULL = "no timing recorded in the new model" (every
  -- existing row), which is what triggers the application's legacy fallback.
  if not exists (select 1 from pg_constraint where conname = 'crm_shipments_pickup_timing_mode_check') then
    alter table public.crm_shipments
      add constraint crm_shipments_pickup_timing_mode_check
      check (pickup_timing_mode is null
             or pickup_timing_mode in ('tbd', 'window', 'appointment'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'crm_shipments_delivery_timing_mode_check') then
    alter table public.crm_shipments
      add constraint crm_shipments_delivery_timing_mode_check
      check (delivery_timing_mode is null
             or delivery_timing_mode in ('tbd', 'window', 'appointment'));
  end if;

  -- ONE ACTIVE INTERPRETATION: the clock columns that may be populated are
  -- decided entirely by the mode. This is what makes an appointment stored as
  -- a zero-length window, or a stale window left behind after switching to an
  -- appointment, impossible rather than merely discouraged.
  --
  --   mode NULL        -> all three clock columns must be NULL (legacy row)
  --   mode 'tbd'       -> all three clock columns must be NULL
  --   mode 'window'    -> BOTH window bounds set, appointment NULL
  --   mode 'appointment' -> appointment set, BOTH window bounds NULL
  if not exists (select 1 from pg_constraint where conname = 'crm_shipments_pickup_timing_shape_check') then
    alter table public.crm_shipments
      add constraint crm_shipments_pickup_timing_shape_check
      check (
        case pickup_timing_mode
          when 'window' then
            pickup_window_start is not null
            and pickup_window_end is not null
            and pickup_appointment_time is null
          when 'appointment' then
            pickup_appointment_time is not null
            and pickup_window_start is null
            and pickup_window_end is null
          else -- 'tbd' or NULL
            pickup_appointment_time is null
            and pickup_window_start is null
            and pickup_window_end is null
        end
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'crm_shipments_delivery_timing_shape_check') then
    alter table public.crm_shipments
      add constraint crm_shipments_delivery_timing_shape_check
      check (
        case delivery_timing_mode
          when 'window' then
            delivery_window_start is not null
            and delivery_window_end is not null
            and delivery_appointment_time is null
          when 'appointment' then
            delivery_appointment_time is not null
            and delivery_window_start is null
            and delivery_window_end is null
          else
            delivery_appointment_time is null
            and delivery_window_start is null
            and delivery_window_end is null
        end
      );
  end if;

  -- A timing mode is a statement ABOUT A DAY. Recording "TBD" or a window with
  -- no date is not a meaningful freight fact and is the shape that produced
  -- dateless Rate Confirmations, so the date is required whenever a mode is
  -- set. The reverse is allowed: a date with no mode yet is a legitimate
  -- intermediate state while an agent is still entering the load.
  if not exists (select 1 from pg_constraint where conname = 'crm_shipments_pickup_timing_needs_date_check') then
    alter table public.crm_shipments
      add constraint crm_shipments_pickup_timing_needs_date_check
      check (pickup_timing_mode is null or pickup_date is not null);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'crm_shipments_delivery_timing_needs_date_check') then
    alter table public.crm_shipments
      add constraint crm_shipments_delivery_timing_needs_date_check
      check (delivery_timing_mode is null or delivery_date is not null);
  end if;

  -- Window bounds must not run backwards. Equal start/end is REJECTED on
  -- purpose: a zero-length window is precisely the appointment-in-disguise
  -- pattern this migration exists to end. An agent who means 08:30 sharp must
  -- record mode 'appointment'.
  if not exists (select 1 from pg_constraint where conname = 'crm_shipments_pickup_window_order_check') then
    alter table public.crm_shipments
      add constraint crm_shipments_pickup_window_order_check
      check (pickup_window_start is null
             or pickup_window_end is null
             or pickup_window_end > pickup_window_start);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'crm_shipments_delivery_window_order_check') then
    alter table public.crm_shipments
      add constraint crm_shipments_delivery_window_order_check
      check (delivery_window_start is null
             or delivery_window_end is null
             or delivery_window_end > delivery_window_start);
  end if;
end;
$$;

-- ── Index ────────────────────────────────────────────────────────────────────
-- The one read pattern the new columns introduce: "this org's live shipments,
-- by the day freight actually moves". Partial on the rows that have adopted the
-- new model so it stays small while legacy rows still dominate the table.
create index if not exists crm_shipments_org_pickup_date_idx
  on public.crm_shipments (org_id, pickup_date)
  where pickup_date is not null and deleted_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- NO BACKFILL — DELIBERATE, NOT AN OMISSION.
--
-- Deriving pickup_date from pickup_at would be a reinterpretation of historical
-- records, not a migration: for every existing row the stored time-of-day is of
-- unknown provenance (it may be a real appointment, or a value invented purely
-- to satisfy the datetime-local control). Writing those into the new model
-- would launder a guess into what then looks like authoritative data, and it
-- would do so on rows whose documents are already generated and immutable.
--
-- Existing rows therefore keep pickup_timing_mode = NULL, which the application
-- reads as "this row predates the timing model" and serves from the legacy
-- columns instead. Historical interpretation is preserved exactly as-is and is
-- documented in the resolver rather than baked into the data.
--
-- If a backfill is ever wanted it should be a separate, reviewed data migration
-- with an explicit rule per mode, run deliberately — the same posture
-- crm_documents_is_public and crm_bol_entries take for their data changes.
-- ─────────────────────────────────────────────────────────────────────────────
