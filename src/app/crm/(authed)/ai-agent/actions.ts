"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Claim a released AI lead — sets assigned_user_id to the caller, allowed
 * for any CRM user. The update is guarded on assigned_user_id IS NULL so a
 * race between two reps clicking "Claim" at once can only ever seat one of
 * them; the loser gets a clear "already claimed" error instead of silently
 * overwriting the winner's assignment.
 */
export async function claimAiLead(accountId: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: updated, error } = await supabase
    .from("crm_accounts")
    .update({ assigned_user_id: user.id })
    .eq("id", accountId)
    .eq("source", "ai_agent")
    .eq("ai_status", "released")
    .is("deleted_at", null)
    .is("assigned_user_id", null)
    .select("id, name")
    .maybeSingle();

  if (error) {
    return { ok: false, error: "Could not claim the lead. Please try again." };
  }
  if (!updated) {
    return { ok: false, error: "This lead is no longer available to claim." };
  }

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.aiLeadClaimed,
    summary: `Claimed AI lead: ${updated.name as string}`,
  });

  revalidatePath("/crm/ai-agent");
  revalidatePath("/crm/accounts");
  revalidatePath(`/crm/accounts/${accountId}`);
  revalidatePath("/crm");
  return { ok: true };
}
