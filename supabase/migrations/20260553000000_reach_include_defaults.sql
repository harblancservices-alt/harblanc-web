-- 20260553000000_reach_include_defaults.sql
-- Backhaul Reach rebuild (two-tab Send / Contacts UI). Two small default
-- changes; both idempotent and safe to re-run. No data is dropped or renamed —
-- the reach_* tables, the 186 built-in markets, the posture×leverage templates,
-- and the reach_sends suppression log all stay exactly as they are.
--
--   1. broker_contacts.is_backhaul default → true. "Include" (whether a contact
--      is used for backhaul reach) now defaults ON for brand-new contacts, per
--      the redesign. Existing rows are untouched; the app already sets the flag
--      explicitly on the add/edit forms, so this only covers inserts that omit
--      it.
--   2. reach_settings.default_leverage default → 'balanced' (the "Standard"
--      style), and the singleton row is moved to 'balanced' so the new default
--      style is Standard. The stored leverage VALUES are unchanged — only the
--      operator-facing labels changed (confident→Low-key, balanced→Standard,
--      push→Eager), so no template migration is required.

-- 1. Include defaults ON for new contacts.
alter table public.broker_contacts
  alter column is_backhaul set default true;

-- 2. Default style = Standard (balanced).
alter table public.reach_settings
  alter column default_leverage set default 'balanced';

-- Move the singleton to Standard only if it's still the old seed default. This
-- respects any deliberate choice the operator makes later in Setup.
update public.reach_settings
  set default_leverage = 'balanced', updated_at = now()
  where id = true and default_leverage = 'confident';
