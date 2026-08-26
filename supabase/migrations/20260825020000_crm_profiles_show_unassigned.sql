-- Per-profile "Show unassigned" visibility flag (Brent, 2026-08-25).
--
-- The centralised company model gives a sales agent only the companies
-- assigned to them. This is the escape hatch for the second-most-common
-- case: an agent who should ALSO be able to pick up companies nobody owns
-- yet, without being handed the whole org.
--
-- Deliberately a SECOND, INDEPENDENT flag rather than a third value of
-- crm_profiles.can_view_all_companies. The two answer different questions
-- ("can they see everyone else's book" vs "can they see the unowned pile")
-- and an admin needs to grant one without the other.
--
-- ADDITIVE ONLY. No existing column is altered, nothing is backfilled, and
-- no existing row's meaning changes: the column arrives false for everybody,
-- which is exactly the behaviour in place today (nobody sees unassigned
-- companies in the agent-facing list). Nullable rather than NOT NULL so the
-- add is a pure catalog change with no table rewrite; every reader coalesces
-- with `?? false`, so a null and a false are the same answer.
--
-- SECURITY NOTE, deliberately not addressed here: crm_profiles' only RLS
-- policy (crm_profiles_rw) is ALL/authenticated scoped to
-- `org_id = crm_current_org()`, so any member of the org can already write
-- any profile column except `role` (which crm_profiles_guard_role blocks).
-- This column inherits that, exactly like can_view_all_companies does today.
-- Tightening that policy is a separate, deliberate change — see the report.

alter table public.crm_profiles
  add column if not exists show_unassigned boolean default false;

comment on column public.crm_profiles.show_unassigned is
  'When true, this member additionally sees companies with no assigned owner in the agent-facing Companies list. Independent of can_view_all_companies. Null is read as false.';
