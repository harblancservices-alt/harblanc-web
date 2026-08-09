"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * "Run research" — logs a request for fresh AI research on this company. No
 * new table: crm_activities.kind is free text, so ai_research_requested
 * needed no DDL. This does NOT itself call an AI provider — the actual
 * research generation is an external pipeline (same one that already
 * populates is_ai=true crm_notes and the ai_status pending_review/released
 * flow the AI Review queue runs on); this just drops the durable, visible
 * signal that a request happened (shows in History and drives the AI
 * Research tab's "Last requested" label). Wiring that external pipeline to
 * actually consume this signal (poll crm_activities, or a webhook) is a
 * follow-up outside this Next.js app, not a schema gap.
 */
export async function requestAiResearch(accountId: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: account } = await supabase
    .from("crm_accounts")
    .select("name")
    .eq("id", accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!account) return { ok: false, error: "Company not found." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.aiResearchRequested,
    summary: `AI research requested for ${account.name as string}`,
  });

  revalidatePath(`/crm/accounts/${accountId}`);
  return { ok: true };
}
