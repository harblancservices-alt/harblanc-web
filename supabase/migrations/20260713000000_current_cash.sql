-- 20260713000000_current_cash.sql
-- Brent's cash on hand, entered by hand on the dashboard countdown widget and
-- compared against the total of all countdown goals to show the shortfall.
-- One additive column on the existing dispatch_settings singleton (id=true),
-- alongside the fuel defaults and net-profit goals. IF NOT EXISTS keeps this a
-- no-op against the live schema (applied separately).
--
--   current_cash — money currently on hand. Purely owner-entered; nothing
--                  computes it. Defaults to 0 until Brent sets it.

alter table public.dispatch_settings
  add column if not exists current_cash numeric(12, 2) not null default 0;
