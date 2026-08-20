"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser } from "@/lib/crm/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ActionResult } from "./types";

/**
 * Every mutating action in the Admin Account section, in one file.
 *
 * SECURITY MODEL (re-verified in every function below, never trusted from a
 * caller):
 *   1. requireCrmUser() — real session + active crm_profiles membership.
 *   2. caller.role === "owner" — only an admin may reach any of this.
 *   3. memberId !== caller.id — an admin can never edit their OWN row through
 *      this file (matches updateMember()'s existing "can't deactivate
 *      yourself" rule in ../settings/actions.ts, extended to every field
 *      here since a self-promotion-or-demotion loophole would be worse than
 *      a self-deactivation one).
 *   4. The target row is re-fetched here (never trusted from the client) and
 *      scoped to `org_id = caller.orgId` — a submitted memberId from another
 *      org simply resolves to no row.
 *   5. target.is_primary_owner === true → always denied. There is exactly
 *      one primary owner per org (enforced by a partial unique index —
 *      20260818010000_crm_admin_account.sql) and NOTHING in this file can
 *      ever change that row's role, active state, or company-visibility
 *      flag, for any caller, including another admin.
 *
 * Every write goes through the SERVICE-ROLE client
 * (createServiceRoleClient(), src/lib/supabase/server.ts), not the session-
 * bound one — crm_profiles has a BEFORE INSERT/UPDATE trigger
 * (crm_profiles_guard_role, 20260818000000_crm_profiles_role_lockdown.sql)
 * that unconditionally rejects any role write from the `authenticated`/
 * `anon` Postgres roles (i.e. the normal cookie-bound client), even from a
 * legitimate owner-only server action — by design, per that migration's own
 * header. The service-role client runs as `service_role`, which the trigger
 * never touches, so it's the only way a real role change can land. The other
 * columns here (is_active, can_view_all_companies) aren't blocked by that
 * trigger, but every write in this file goes through the same service-role
 * client anyway for one consistent, fully-audited enforcement path rather
 * than splitting "some columns use the session client, some don't."
 *
 * None of these actions ever call logActivity() (@/lib/crm/activity) —
 * Brent's explicit instruction: his own admin actions (role changes,
 * promotions, control toggles, suspensions) must never appear in the
 * Activity tab, for himself or when another admin performs them. The
 * org-wide activity feed (./activity-data.ts) only ever reads crm_activities
 * + crm_calls + crm_notes, none of which this file writes to.
 */

type TargetProfileRow = {
  id: string;
  org_id: string;
  role: string;
  is_active: boolean;
  is_primary_owner: boolean;
  can_view_all_companies: boolean;
};

async function loadEditableTarget(
  memberId: string,
): Promise<{ ok: true; callerOrgId: string; target: TargetProfileRow } | { ok: false; error: string }> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only an admin can manage team accounts." };
  }
  if (memberId === user.id) {
    return { ok: false, error: "You can't edit your own account from here." };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("crm_profiles")
    .select("id, org_id, role, is_active, is_primary_owner, can_view_all_companies")
    .eq("id", memberId)
    .eq("org_id", user.orgId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "Could not find this team member." };
  }
  const target = data as TargetProfileRow;
  if (target.is_primary_owner) {
    return { ok: false, error: "The primary owner's account can't be changed." };
  }

  return { ok: true, callerOrgId: user.orgId, target };
}

/**
 * The Accounts detail page's "Save changes" — sets access level (Sales
 * Agent/Admin) and "Can view all companies" only. `role` here is the ONLY
 * place in the app that can promote/demote a member post-launch
 * (crm_profiles_guard_role blocks every other path); promoting someone to
 * Admin gives them control over every non-primary-owner, non-self account —
 * never over the primary owner or their own row, both enforced above and
 * re-enforced by every other action in this file.
 *
 * Does NOT touch is_active (2026-08-19) — status changes only ever happen
 * through suspendAndReassignMember() or reactivateMember() below, both of
 * which enforce "a suspended member's companies must never go unowned." The
 * general form used to also carry an "Active account" checkbox wired into
 * this action, which could silently deactivate a member with zero
 * reassignment — the exact P0 bug CRM_MASTER_AUDIT.md §3 flagged. That
 * checkbox is now removed from MemberAccountForm.tsx entirely.
 */
export async function updateMemberAccount(
  memberId: string,
  formData: FormData,
): Promise<ActionResult> {
  const loaded = await loadEditableTarget(memberId);
  if (!loaded.ok) return loaded;

  const roleInput = String(formData.get("access_level") ?? "").trim();
  const role = roleInput === "owner" ? "owner" : "member";
  const canViewAllCompanies = String(formData.get("can_view_all_companies") ?? "") === "on";

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("crm_profiles")
    .update({
      role,
      can_view_all_companies: canViewAllCompanies,
    })
    .eq("id", memberId)
    .eq("org_id", loaded.callerOrgId);

  if (error) {
    return { ok: false, error: "Could not save changes. Please try again." };
  }

  revalidatePath(`/crm/admin/accounts/${memberId}`);
  revalidatePath("/crm/admin/accounts");
  return { ok: true };
}

/**
 * The detail page's "Suspend user" flow — reassigns the member's entire book
 * of business (every crm_accounts row with assigned_user_id = memberId) to
 * `reassignToUserId`, THEN deactivates the member's account. Both steps are
 * required together: Brent's explicit call is that a suspended member's
 * companies must not go unowned, so suspension always carries a
 * reassignment rather than offering a bare "deactivate, leave the companies
 * orphaned" path.
 *
 * Same `loadEditableTarget` guards as updateMemberAccount apply to the
 * member being suspended (owner-only caller, never self, never the primary
 * owner). The reassignment target is independently re-verified here — never
 * trusted from the client beyond its id — as an ACTIVE crm_profiles row in
 * the SAME org (`loaded.callerOrgId`, from the caller's own verified
 * session, never a submitted org id). The reassignment target may be any
 * active member INCLUDING the primary owner or the caller themselves —
 * only the row being suspended is restricted; there's no rule against the
 * primary owner (or the acting admin) taking over a departing member's
 * companies.
 *
 * Ordered so a failure is never destructive: companies move first (a safe,
 * idempotent step — re-running it after a partial failure just finds 0
 * rows left to move), and only once that succeeds does the account actually
 * get deactivated. If the org has no other active member to reassign to,
 * the caller gets a clear error instead of a silent no-op suspend.
 */
export async function suspendAndReassignMember(
  memberId: string,
  reassignToUserId: string,
): Promise<ActionResult> {
  const loaded = await loadEditableTarget(memberId);
  if (!loaded.ok) return loaded;

  if (!reassignToUserId || reassignToUserId === memberId) {
    return { ok: false, error: "Choose who should take over this user's companies." };
  }

  const supabase = createServiceRoleClient();

  const { data: targetData, error: targetError } = await supabase
    .from("crm_profiles")
    .select("id, is_active")
    .eq("id", reassignToUserId)
    .eq("org_id", loaded.callerOrgId)
    .maybeSingle();
  const target = targetData as { id: string; is_active: boolean } | null;
  if (targetError || !target || !target.is_active) {
    return { ok: false, error: "Choose an active user to reassign these companies to." };
  }

  const { error: reassignError } = await supabase
    .from("crm_accounts")
    .update({ assigned_user_id: reassignToUserId })
    .eq("assigned_user_id", memberId)
    .eq("org_id", loaded.callerOrgId)
    .is("deleted_at", null);
  if (reassignError) {
    return { ok: false, error: "Could not reassign this user's companies. Please try again." };
  }

  const { error: suspendError } = await supabase
    .from("crm_profiles")
    .update({ is_active: false })
    .eq("id", memberId)
    .eq("org_id", loaded.callerOrgId);
  if (suspendError) {
    return {
      ok: false,
      error: "Companies were reassigned, but the account could not be suspended. Please try again.",
    };
  }

  revalidatePath(`/crm/admin/accounts/${memberId}`);
  revalidatePath("/crm/admin/accounts");
  return { ok: true };
}

/**
 * The detail page's "Reactivate" action — the counterpart to
 * suspendAndReassignMember() for the opposite direction. Unlike suspending,
 * reactivating never needs a reassignment step (the member has no companies
 * to hand off — suspension already moved them all away), so this is a
 * single-field flip, not a dialog flow. Added 2026-08-19 alongside removing
 * the "Active account" checkbox from updateMemberAccount()'s form (see that
 * function's docstring) — before this, the ONLY way to set is_active back
 * to true was that same unsafe checkbox, which could ALSO deactivate a
 * member with zero reassignment. Status now only ever changes through this
 * action or suspendAndReassignMember(), never through the general Save
 * button.
 */
export async function reactivateMember(memberId: string): Promise<ActionResult> {
  const loaded = await loadEditableTarget(memberId);
  if (!loaded.ok) return loaded;

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("crm_profiles")
    .update({ is_active: true })
    .eq("id", memberId)
    .eq("org_id", loaded.callerOrgId);

  if (error) {
    return { ok: false, error: "Could not reactivate this account. Please try again." };
  }

  revalidatePath(`/crm/admin/accounts/${memberId}`);
  revalidatePath("/crm/admin/accounts");
  return { ok: true };
}
