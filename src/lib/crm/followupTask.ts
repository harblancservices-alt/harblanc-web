import type { SupabaseClient } from "@supabase/supabase-js";
import { logActivity, CRM_ACTIVITY } from "./activity";
import { DEFAULT_PRIORITY } from "@/app/crm/(authed)/tasks/priority";

/**
 * Keeps a real crm_tasks row in sync with a "follow-up" date set elsewhere
 * (crm_contacts.next_followup_at via the Add/Edit Contact form,
 * crm_calls.reminder_at via Log Call) — the actual gap this closes: setting
 * either of those previously saved a bare date/flag with no linked task, so
 * it never appeared on the real Tasks page or the dashboard's open-tasks
 * query.
 *
 * Upsert semantics via the caller's own `followup_task_id` pointer (avoids
 * spawning a duplicate task every time the same follow-up gets re-edited):
 *   - followupAt null (cleared) + an existing OPEN linked task -> soft-delete
 *     that task, return null. A task the rep already completed is left
 *     alone — completing it is a real outcome, not something clearing an
 *     unrelated date field should undo.
 *   - followupAt set + an existing OPEN linked task -> just update its
 *     due_at, keep everything else (title, assignee, notes) as the rep may
 *     have customized it from the Tasks page since.
 *   - followupAt set + no existing task (or the old one is completed/
 *     deleted, i.e. that follow-up cycle already finished) -> create a new
 *     one via the exact same insert shape tasks/actions.ts::createTask uses,
 *     so completing/reopening it afterward behaves identically to any other
 *     task — nothing about it is special-cased anywhere else in the app.
 *
 * Best-effort: a failure here never fails the caller's own save (a contact/
 * call save succeeding is more important than its follow-up task syncing
 * perfectly) — returns the previous followup_task_id unchanged on error.
 */
export async function syncFollowupTask(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    userId: string;
    accountId: string | null;
    contactId: string | null;
    /** Shown in the auto-created task's title ("Follow up with X"). */
    subjectName: string;
    /** ISO timestamp, or null to clear. */
    followupAt: string | null;
    existingTaskId: string | null;
  },
): Promise<string | null> {
  const { orgId, userId, accountId, contactId, subjectName, followupAt, existingTaskId } = input;

  if (!followupAt) {
    if (existingTaskId) {
      await supabase
        .from("crm_tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", existingTaskId)
        .eq("status", "open")
        .is("deleted_at", null);
    }
    return null;
  }

  if (existingTaskId) {
    const { data: existing } = await supabase
      .from("crm_tasks")
      .select("id, status, deleted_at")
      .eq("id", existingTaskId)
      .maybeSingle();

    if (existing && existing.status === "open" && !existing.deleted_at) {
      await supabase.from("crm_tasks").update({ due_at: followupAt }).eq("id", existingTaskId);
      return existingTaskId;
    }
  }

  const { data: newTask, error } = await supabase
    .from("crm_tasks")
    .insert({
      org_id: orgId,
      account_id: accountId,
      contact_id: contactId,
      title: `Follow up with ${subjectName}`,
      task_type: "Follow-up call",
      due_at: followupAt,
      priority: DEFAULT_PRIORITY,
      assigned_user_id: userId,
      status: "open",
    })
    .select("id")
    .single();

  if (error || !newTask) return existingTaskId;

  if (accountId) {
    await logActivity(supabase, {
      orgId,
      userId,
      accountId,
      contactId: contactId ?? undefined,
      kind: CRM_ACTIVITY.taskCreated,
      summary: `Task added: Follow up with ${subjectName}`,
    });
  }

  return newTask.id as string;
}
