-- 20260818010000_crm_admin_account.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CRM "Admin Account" tab (src/app/crm/(authed)/admin/**) — owner-only elevated
-- section: Overview / Accounts / Activity / Documents. Reuses the existing
-- crm auth (crmGate/requireCrmUser) and crm_profiles.role — no new user/login/
-- org/permission framework. This migration adds the two columns that section
-- needs on crm_profiles.
--
-- is_primary_owner: marks the ONE account (Brent's) that can never be changed
-- by anyone, including other admins — access-level switch disabled, controls
-- locked, no Suspend, both in the UI and server-side in admin/actions.ts. The
-- backfill below auto-marks the earliest-created role='owner' row per org as
-- primary, so the invariant ("always exactly one protected primary owner")
-- holds immediately after this migration runs, with no manual follow-up SQL.
-- The partial unique index then guarantees no later write can ever create a
-- second one (app code never sets this column directly either way — only
-- read, never written, by anything the client can reach; there is currently
-- no UI path that assigns it to a different row).
--
-- can_view_all_companies: the "Can view all companies" account control toggle
-- on a team member's Admin Account detail page. Defaults true so existing
-- behavior (every member currently sees every company — there is no
-- assigned-rep visibility restriction in the CRM today) is unchanged for
-- everyone until an admin explicitly narrows a specific member's access.
--
-- Role changes themselves keep going through crm_profiles_guard_role
-- (20260818000000_crm_profiles_role_lockdown.sql) — that trigger only blocks
-- the `authenticated`/`anon` Postgres roles, so admin/actions.ts's role-change
-- action must run through the service-role client (createServiceRoleClient(),
-- src/lib/supabase/server.ts), never the session-bound one. This migration
-- does not touch that trigger.
--
-- Idempotent: every statement is `if not exists` / re-runnable.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.crm_profiles
  add column if not exists is_primary_owner boolean not null default false;

alter table public.crm_profiles
  add column if not exists can_view_all_companies boolean not null default true;

-- Backfill: the earliest-created 'owner' row in each org becomes that org's
-- primary owner. Safe to re-run — a no-op once every org already has one.
with earliest_owner as (
  select distinct on (org_id) id
  from public.crm_profiles
  where role = 'owner'
  order by org_id, created_at asc, id asc
)
update public.crm_profiles p
set is_primary_owner = true
from earliest_owner e
where p.id = e.id
  and not exists (
    select 1 from public.crm_profiles p2
    where p2.org_id = p.org_id and p2.is_primary_owner
  );

-- Guarantees exactly one primary owner per org can ever exist at a time.
create unique index if not exists crm_profiles_one_primary_owner_per_org
  on public.crm_profiles (org_id)
  where is_primary_owner;
