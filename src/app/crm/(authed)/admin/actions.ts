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
 * Agent/Admin), the two Account Controls toggles, in one write. `role` here
 * is the ONLY place in the app that can promote/demote a member post-launch
 * (crm_profiles_guard_role blocks every other path); promoting someone to
 * Admin gives them control over every non-primary-owner, non-self account —
 * never over the primary owner or their own row, both enforced above and
 * re-enforced by every other action in this file.
 */
export async function updateMemberAccount(
  memberId: string,
  formData: FormData,
): Promise<ActionResult> {
  const loaded = await loadEditableTarget(memberId);
  if (!loaded.ok) return loaded;

  const roleInput = String(formData.get("access_level") ?? "").trim();
  const role = roleInput === "owner" ? "owner" : "member";
  const isActive = String(formData.get("is_active") ?? "") === "on";
  const canViewAllCompanies = String(formData.get("can_view_all_companies") ?? "") === "on";

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("crm_profiles")
    .update({
      role,
      is_active: isActive,
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
 * The detail page's standalone "Suspend user" footer button — an immediate,
 * one-click deactivation (is_active=false only; role and the company-
 * visibility flag are untouched) distinct from the toggle-then-Save flow the
 * rest of the form uses, same rationale a destructive action usually gets
 * its own confirm rather than living inside a general "Save changes".
 */
export async function suspendMember(memberId: string): Promise<ActionResult> {
  const loaded = await loadEditableTarget(memberId);
  if (!loaded.ok) return loaded;

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("crm_profiles")
    .update({ is_active: false })
    .eq("id", memberId)
    .eq("org_id", loaded.callerOrgId);

  if (error) {
    return { ok: false, error: "Could not suspend this user. Please try again." };
  }

  revalidatePath(`/crm/admin/accounts/${memberId}`);
  revalidatePath("/crm/admin/accounts");
  return { ok: true };
}
