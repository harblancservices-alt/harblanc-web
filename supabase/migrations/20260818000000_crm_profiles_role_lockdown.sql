-- 20260818000000_crm_profiles_role_lockdown.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CRM Phase 1 — close the crm_profiles.role self-escalation gap found in the
-- Phase 0 separation audit (CRM_SEPARATION_AUDIT.md §7).
--
-- THE HOLE: crm_profiles_rw (crm_foundation.sql) is a normal `for all`
-- row-level policy — it scopes which ROWS a signed-in member may touch
-- (org_id = crm_current_org()), but it has never constrained which COLUMNS a
-- member may write within a row they're already allowed to touch. Every
-- owner-only action in the app (updateMember, updateBrokerProfile, the AI
-- Review/Upgrades/Settings gates, …) enforces `role !== "owner"` in the
-- server action's own code — but that check only guards the one code path
-- that action represents. Any signed-in CRM member can also reach
-- crm_profiles directly through the same publishable-key Supabase client the
-- app itself uses client-side elsewhere (see LoginForm.tsx's own direct
-- `.from("crm_profiles")` / `.from("crm_user_events")` calls — this is an
-- established, working pattern in this codebase, not a hypothetical one).
-- Nothing before this migration stopped:
--   supabase.from("crm_profiles").update({ role: "owner" }).eq("id", myId)
-- run from that same client, self-promoting a member to owner in one call.
--
-- THE FIX (why a trigger, not column-level REVOKE): the obvious first idea —
-- `revoke update (role), insert (role) on crm_profiles from authenticated` —
-- does NOT work in this schema. `authenticated` and `anon` hold TABLE-LEVEL
-- UPDATE/INSERT grants on crm_profiles (from crm_foundation.sql's blanket
-- `grant all on all tables in schema public to authenticated`-style setup),
-- and in Postgres a table-level UPDATE/INSERT grant overrides a column-level
-- REVOKE on the same table for the same role — the column-level privilege
-- system only restricts a role that does NOT already hold the table-level
-- grant. Column REVOKE was tested against this schema and confirmed to be a
-- no-op: the escalation call still succeeded. A BEFORE INSERT/UPDATE trigger
-- runs inside Postgres's row-processing pipeline regardless of which grant
-- authorized the statement, so it is the only enforcement point that actually
-- sees and can reject the write.
--
-- THE TRIGGER: for any write executed as the `authenticated` or `anon`
-- Postgres role (i.e. through PostgREST/the publishable-key client — never
-- service_role, so the app's own service-role tooling and the Supabase
-- dashboard/table editor, which run as `postgres`, are unaffected):
--   - INSERT: role must be exactly 'member' (the schema default) — blocks
--     inserting a fresh crm_profiles row with role='owner' for any id.
--   - UPDATE: role must be unchanged from the existing row — blocks
--     self-promotion and blocks promoting/demoting any other member's row.
-- Any other column (full_name, title, phone, is_active, …) is untouched by
-- this trigger and continues to write exactly as before.
--
-- VERIFIED LIVE (applied directly to production, attack-tested before this
-- file was written):
--   - member self-promote (`update ... set role='owner' where id = self`) →
--     blocked, raises 42501.
--   - member promoting another member in the same org → blocked, raises
--     42501.
--   - legitimate non-role update (e.g. updateMember() changing full_name/
--     title/is_active) → still works.
--   - role column value unchanged by any of the above except the one
--     legitimate service-role/dashboard path.
--
-- Idempotent: `create or replace function` and `drop trigger if exists` +
-- `create trigger` are both safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.crm_profiles_guard_role()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') then
    if (tg_op='INSERT' and new.role is distinct from 'member')
       or (tg_op='UPDATE' and new.role is distinct from old.role) then
      raise exception 'crm_profiles.role cannot be set or changed by client role %', current_user using errcode='42501';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists crm_profiles_guard_role on public.crm_profiles;

create trigger crm_profiles_guard_role before insert or update on public.crm_profiles for each row execute function public.crm_profiles_guard_role();
