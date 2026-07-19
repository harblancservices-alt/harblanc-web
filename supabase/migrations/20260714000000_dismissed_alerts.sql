-- 20260714000000_dismissed_alerts.sql
-- Per-alert dismissals for the dashboard "Needs attention" panel.
--
-- The alert groups are pure derivations of live data — there is no alerts
-- table, and an alert clears itself the moment the underlying thing is fixed.
-- This table is the one piece of state that derivation can't provide: the
-- owner saying "I know, don't show me this one again". One row per dismissed
-- alert, keyed by the stable alert key the dashboard computes:
--
--   maintenance:{reminderId}     receivable:{loadId}
--   incomplete-load:{loadId}     application:{id}      quote:{id}
--
-- alert_key is the primary key, so a dismissal is idempotent — swiping the
-- same alert twice can't produce a duplicate, and the undo is a plain delete
-- on that key.
--
-- Single-operator app, so no per-user scoping — one shared dismissal set.
-- Service-role only (admin server actions); RLS on with NO policy = deny all
-- to anon/auth, matching brokers / loads / countdown_goals / email_presets.
-- IF NOT EXISTS keeps this idempotent (the remote DB is applied separately).

create table if not exists public.dismissed_alerts (
  alert_key text primary key,
  dismissed_at timestamptz not null default now()
);

alter table public.dismissed_alerts enable row level security;

-- The dashboard reads the whole set on every render and filters in JS; the
-- index is for the housekeeping sweep (oldest-first) rather than that read.
create index if not exists dismissed_alerts_dismissed_at_idx
  on public.dismissed_alerts (dismissed_at desc);
