-- 20260822000000_crm_accounts_guard_assignment.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Make company ownership admin-enforced AT THE DATABASE, not just in the app.
--
-- THE HOLE (identical in shape to the crm_profiles.role one that
-- 20260818000000_crm_profiles_role_lockdown.sql had to close): crm_accounts_rw
-- (crm_foundation.sql:499) is a plain `for all` ROW-level policy — it scopes
-- WHICH ROWS a signed-in member may touch (org_id = crm_current_org()), and has
-- never constrained WHICH COLUMNS they may write inside a row they can already
-- touch. Every ownership rule lives in server-action code
-- (accounts/actions.ts::assignAccount + ::updateAccount), which only guards the
-- code paths those actions represent. Any signed-in CRM member can also reach
-- crm_accounts directly through the same publishable-key Supabase client the
-- app already uses client-side elsewhere (see LoginForm.tsx's own direct
-- `.from("crm_profiles")` / `.from("crm_user_events")` calls — an established,
-- working pattern here, not a hypothetical). Nothing before this migration
-- stopped:
--   supabase.from("crm_accounts").update({ assigned_user_id: myId }).eq("id", someoneElsesCompany)
-- run from that same client — a member silently taking another rep's book, or
-- dumping their own accounts back into the unclaimed pool.
--
-- THE RULE ENFORCED HERE (mirrors assignAccount() exactly):
--   - Not changing assigned_user_id at all      → always allowed.
--   - Caller is an owner (crm_profiles.role)    → always allowed.
--   - Company is UNCLAIMED and the caller is    → allowed (self-claim).
--     assigning it to THEMSELVES
--   - Anything else                             → rejected, errcode 42501.
--
-- WHY A TRIGGER, NOT COLUMN-LEVEL REVOKE: per 20260818000000's own findings,
-- `revoke update (assigned_user_id) on crm_accounts from authenticated` is a
-- NO-OP in this schema — `authenticated`/`anon` hold TABLE-level UPDATE grants,
-- and in Postgres a table-level grant overrides a column-level REVOKE for the
-- same role. A BEFORE UPDATE trigger runs inside the row-processing pipeline
-- regardless of which grant authorized the statement, so it is the only
-- enforcement point that actually sees and can reject the write.
--
-- WHAT IT DELIBERATELY DOES NOT BREAK:
--   - createAccount()'s "default to the creator" — that's an INSERT; this
--     trigger is BEFORE UPDATE only, so a new company can still be born owned
--     by whoever created it (or NULL for the BOL/OTR {unassigned:true} path).
--   - claimAiLead() (ai-agent/actions.ts) — NULL -> auth.uid() is exactly the
--     self-claim case, allowed.
--   - assignAccount() — a member's self-claim is allowed; every admin path
--     passes the role check.
--   - suspendAndReassignMember() (admin/actions.ts) — runs on
--     createServiceRoleClient(), i.e. Postgres role `service_role`, which is
--     outside the ('authenticated','anon') gate and bypasses this entirely.
--     The Supabase dashboard/table editor (`postgres`) is likewise unaffected.
--   - promoteAccountToProspect() — never writes assigned_user_id, so the
--     "unchanged" fast path returns immediately.
--   - Every other UPDATE on crm_accounts (field edits, lifecycle moves,
--     deleted_at soft-delete, the updated_at/tsv triggers) — none of them
--     change assigned_user_id, so all take the same fast path.
--   - Re-submitting the SAME owner a row already has is never blocked
--     (`is not distinct from`), so a member editing other fields on a company
--     they own keeps working even if a form round-trips the current value.
--
-- crm_is_owner() is SECURITY DEFINER for the same reason crm_current_org() is
-- (crm_foundation.sql:30-50): it reads crm_profiles with RLS bypassed. The
-- TRIGGER function itself is deliberately NOT security definer — inside a
-- SECURITY DEFINER function `current_user` becomes the function owner, which
-- would break the ('authenticated','anon') gate that decides whether the rule
-- applies at all.
--
-- Idempotent: `create or replace function` and `drop trigger if exists` +
-- `create trigger` are both safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Is the CURRENT caller an admin (crm_profiles.role = 'owner')? Returns false
-- for anyone without an active CRM profile, so "no CRM access" can never read
-- as "admin". Role itself is already immutable from the client — the
-- crm_profiles_guard_role trigger (20260818000000) blocks self-promotion — so
-- this answer can be trusted as an authorization input.
create or replace function public.crm_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role = 'owner'
       from public.crm_profiles p
      where p.id = auth.uid()
        and p.is_active
      limit 1),
    false)
$$;

revoke all on function public.crm_is_owner() from public;
grant execute on function public.crm_is_owner() to authenticated;

create or replace function public.crm_accounts_guard_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Only client-role writes are policed; service_role/postgres pass through.
  if current_user not in ('authenticated','anon') then
    return new;
  end if;

  -- Ownership untouched by this statement — nothing to check.
  if new.assigned_user_id is not distinct from old.assigned_user_id then
    return new;
  end if;

  -- Admins may assign, reassign, or unassign anything.
  if public.crm_is_owner() then
    return new;
  end if;

  -- Everyone else gets exactly one legal transition: claim an UNCLAIMED
  -- company for THEMSELVES.
  if old.assigned_user_id is null and new.assigned_user_id = auth.uid() then
    return new;
  end if;

  raise exception
    'crm_accounts.assigned_user_id: only an admin can reassign or unassign a company (client role %)',
    current_user
    using errcode = '42501';
end; $$;

drop trigger if exists crm_accounts_guard_assignment on public.crm_accounts;

create trigger crm_accounts_guard_assignment
  before update on public.crm_accounts
  for each row execute function public.crm_accounts_guard_assignment();
