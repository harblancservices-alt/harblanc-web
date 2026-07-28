"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateAiPaths(accountId?: string) {
  revalidatePath("/crm/ai-review");
  revalidatePath("/crm/ai-agent");
  revalidatePath("/crm/accounts");
  revalidatePath("/crm");
  if (accountId) revalidatePath(`/crm/accounts/${accountId}`);
}

/**
 * Release a pending AI-sourced lead to the team — flips ai_status to
 * 'released', which is what makes it appear on /crm/ai-agent for everyone
 * and in the normal Companies list. Owner-only (defense in depth to match
 * the settings/actions.ts admin-gate pattern): RLS only scopes crm_accounts
 * to the org, not by role.
 */
export async function releaseAiLead(accountId: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only an admin can release a lead to the team." };
  }

  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_accounts")
    .select("name")
    .eq("id", accountId)
    .eq("source", "ai_agent")
    .eq("ai_status", "pending_review")
    .is("deleted_at", null)
    .maybeSingle();

  if (!prior) return { ok: false, error: "This lead is no longer in the review queue." };

  const { error } = await supabase
    .from("crm_accounts")
    .update({ ai_status: "released" })
    .eq("id", accountId);

  if (error) {
    return { ok: false, error: "Could not release the lead. Please try again." };
  }

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.aiLeadReleased,
    summary: `AI lead released to team: ${prior.name}`,
  });

  revalidateAiPaths(accountId);
  return { ok: true };
}

/**
 * Discard a pending AI-sourced lead (soft delete). Owner-only, same
 * defense-in-depth reasoning as releaseAiLead.
 */
export async function discardAiLead(accountId: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only an admin can discard a lead." };
  }

  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_accounts")
    .select("name")
    .eq("id", accountId)
    .eq("source", "ai_agent")
    .eq("ai_status", "pending_review")
    .is("deleted_at", null)
    .maybeSingle();

  if (!prior) return { ok: false, error: "This lead is no longer in the review queue." };

  const { error } = await supabase
    .from("crm_accounts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", accountId);

  if (error) {
    return { ok: false, error: "Could not discard the lead. Please try again." };
  }

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.aiLeadDiscarded,
    summary: `AI lead discarded: ${prior.name}`,
  });

  revalidateAiPaths(accountId);
  return { ok: true };
}
