"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { fireStageEntryTask } from "@/lib/crm/stageAutomation";
import { normalizeStage, stageLabel } from "../accounts/lifecycle";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Claim a released lead from the queue — sets assigned_user_id to the
 * caller, allowed for any CRM user. Covers every company published into this
 * queue regardless of where it came from (see ./queue.ts: the gate is
 * ai_status='released' AND unclaimed; source is provenance only), not just
 * AI-researched leads, despite the function's name. The
 * update is guarded on assigned_user_id IS NULL so a race between two reps
 * clicking "Claim" at once can only ever seat one of them; the loser gets a
 * clear "already claimed" error instead of silently overwriting the
 * winner's assignment.
 *
 * CRM_URGENCY_AUDIT.md: claiming is how a lead actually enters the pipeline
 * now — if it's still sitting at New Lead (the normal case; everything that
 * reaches this queue lands there via promoteAccountToProspect's guardrail),
 * claiming also advances it to Researching and fires that stage's entry
 * auto-task ("Research + first outreach"), assigned to the claimer, same as
 * clicking the Researching chevron would. A lead somehow already past New
 * Lead when claimed (edge case — not the normal flow) just gets assigned,
 * no stage change and no automation, matching the no-downgrade guardrail's
 * spirit elsewhere.
 */
export async function claimAiLead(accountId: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: updated, error } = await supabase
    .from("crm_accounts")
    .update({ assigned_user_id: user.id })
    .eq("id", accountId)
    .eq("ai_status", "released")
    .is("deleted_at", null)
    .is("assigned_user_id", null)
    .select("id, name, lifecycle_status")
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

  const priorStage = normalizeStage(updated.lifecycle_status as string | null);
  if (priorStage === "new_lead") {
    const { error: stageError } = await supabase
      .from("crm_accounts")
      .update({ lifecycle_status: "researching" })
      .eq("id", accountId);

    if (!stageError) {
      await logActivity(supabase, {
        orgId: user.orgId,
        userId: user.id,
        accountId,
        kind: CRM_ACTIVITY.lifecycleChanged,
        summary: `Stage changed: ${stageLabel(priorStage)} → ${stageLabel("researching")}`,
        meta: { from: priorStage, to: "researching" },
      });

      await fireStageEntryTask(supabase, {
        orgId: user.orgId,
        actorUserId: user.id,
        accountId,
        ownerUserId: user.id,
        stage: "researching",
      });
    }
  }

  revalidatePath("/crm/ai-agent");
  revalidatePath("/crm/accounts");
  revalidatePath(`/crm/accounts/${accountId}`);
  revalidatePath("/crm");
  return { ok: true };
}
