-- 20260552000000_net_profit_goals.sql
-- Editable net-profit goals for the Load Board goal bar. Two additive columns
-- on the existing dispatch_settings singleton (id=true), alongside the fuel
-- defaults. IF NOT EXISTS keeps this a no-op against the live schema (applied
-- separately).
--
--   monthly_net_goal — target net for a single selected month (was the
--                      hardcoded $10,000 constant in ProfitGoalBar).
--   annual_net_goal  — target net across "All months" (the annual goal, default
--                      $120,000). The goal bar switches to this when the month
--                      filter = All months.

alter table public.dispatch_settings
  add column if not exists monthly_net_goal numeric(12, 2) not null default 10000,
  add column if not exists annual_net_goal numeric(12, 2) not null default 120000;
