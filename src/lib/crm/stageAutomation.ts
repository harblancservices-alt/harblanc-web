import type { SupabaseClient } from "@supabase/supabase-js";
import { logActivity, CRM_ACTIVITY } from "./activity";
import { DEFAULT_PRIORITY } from "@/app/crm/(authed)/tasks/priority";
import type { LifecycleStage } from "@/app/crm/(authed)/accounts/lifecycle";

/**
 * Stage-ENTRY automation (CRM_URGENCY_AUDIT.md P0 — "give lifecycle stage a
 * reason to click"). Fired synchronously from the two write paths that ever
 * move a company INTO one of these stages — updateLifecycleStatus
 * (accounts/actions.ts, the profile's chevron tracker) and claimAiLead
 * (ai-agent/actions.ts, which also advances new_lead -> researching as part
 * of claiming). There is no cron/scheduler in this CRM, so this is the only
 * place these tasks are ever created — a stage entered any other way (a bulk
 * import, a future API) will NOT get one unless it also calls this.
 *
 * Inserts directly into crm_tasks (the same shape tasks/actions.ts::createTask
 * and lib/crm/followupTask.ts::syncFollowupTask both use) rather than calling
 * the createTask() action — createTask enforces "non-admins can only assign
 * to themselves," which is the right rule for a human submitting a form, but
 * wrong here: the task must go to the ACCOUNT OWNER, who may not be (and for
 * claimAiLead, generally IS, but for an admin moving someone else's account,
 * is NOT) the person who triggered the stage change.
 */

type StageEntryTaskSpec = { title: string; task_type: string; dueInHours?: number };

/** new_lead and active_customer are deliberately absent — no auto-task on
 * entering either (a brand-new unclaimed lead has nothing to do yet; a won
 * account's onboarding task is still the existing manual "+ Add onboarding
 * task" offer on the profile, not an automatic one). "lost" is handled by
 * the separate win-back clock below, not stage entry. */
const STAGE_ENTRY_TASK: Partial<Record<LifecycleStage, StageEntryTaskSpec>> = {
  researching: { title: "Research + first outreach", task_type: "Research prospect" },
  contacted: { title: "Follow up", task_type: "Follow-up call" },
  quoting: { title: "Follow up on quote", task_type: "Follow-up call", dueInHours: 24 },
};

/**
 * Create the stage's entry task, assigned to the account owner — a no-op if
 * this stage has no configured task, the account has no owner to assign it
 * to (assigned_user_id is null — nothing sensible to do; skipped rather than
 * inventing an assignee), or an OPEN task with that exact title already
 * exists on this account (the duplicate guard the audit called for — matches
 * syncFollowupTask's own "check before insert" pattern since crm_tasks has no
 * natural unique key to upsert against here).
 */
export async function fireStageEntryTask(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    /** Who triggered the change — attributed on the timeline entry, not
     * necessarily who the task gets assigned to. */
    actorUserId: string;
    accountId: string;
    /** crm_accounts.assigned_user_id AFTER this stage change — the task's
     * assignee. */
    ownerUserId: string | null;
    stage: LifecycleStage;
  },
): Promise<void> {
  const spec = STAGE_ENTRY_TASK[input.stage];
  if (!spec || !input.ownerUserId) return;

  const { data: existing } = await supabase
    .from("crm_tasks")
    .select("id")
    .eq("account_id", input.accountId)
    .eq("title", spec.title)
    .eq("status", "open")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const due_at = spec.dueInHours ? new Date(Date.now() + spec.dueInHours * 3_600_000).toISOString() : null;

  const { error } = await supabase.from("crm_tasks").insert({
    org_id: input.orgId,
    account_id: input.accountId,
    title: spec.title,
    task_type: spec.task_type,
    due_at,
    priority: DEFAULT_PRIORITY,
    assigned_user_id: input.ownerUserId,
    status: "open",
  });
  if (error) return;

  await logActivity(supabase, {
    orgId: input.orgId,
    userId: input.actorUserId,
    accountId: input.accountId,
    kind: CRM_ACTIVITY.taskCreated,
    summary: `Task added: ${spec.title}`,
  });
}

/** Title of the lazily-created win-back task — exported so the dashboard's
 * read-time lost-account scan can recognize an already-created one without
 * duplicating the literal string. */
export const WINBACK_TASK_TITLE = "Reach back out (win-back)";

/**
 * Lost win-back (CRM_URGENCY_AUDIT.md's "no cron available, so compute at
 * read-time" instruction): called from the dashboard on every load for each
 * lost account whose last activity is beyond LOST_WINBACK_DAYS. Lazily
 * creates ONE unassigned task per account if an open one doesn't already
 * exist — "unassigned" is deliberate (any rep can grab it, matching the
 * instruction that this is a team-wide win-back candidate, not owned by
 * whoever's account it technically still is). Best-effort and silent: a
 * failure here must never break the dashboard render that triggered it.
 */
export async function ensureWinbackTask(
  supabase: SupabaseClient,
  input: { orgId: string; accountId: string },
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from("crm_tasks")
      .select("id")
      .eq("account_id", input.accountId)
      .eq("title", WINBACK_TASK_TITLE)
      .eq("status", "open")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (existing) return;

    await supabase.from("crm_tasks").insert({
      org_id: input.orgId,
      account_id: input.accountId,
      title: WINBACK_TASK_TITLE,
      task_type: "Follow-up call",
      priority: DEFAULT_PRIORITY,
      assigned_user_id: null,
      status: "open",
    });
    // Deliberately no logActivity here: there's no real "actor" for a
    // read-time lazy background creation (the dashboard viewer didn't ask
    // for this task, they just happened to load the page that noticed it),
    // and attributing it to them would misrepresent the timeline.
  } catch {
    // best-effort — never fail the dashboard render that triggered this
  }
}
