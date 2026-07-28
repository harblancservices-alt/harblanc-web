"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { normalizePriority } from "./priority";

/**
 * Task writes. Same contract as every CRM mutation: resolve the caller with
 * requireCrmUser(), run through the RLS-scoped client, stamp org_id from the
 * SESSION, and log an append-only activity for the events the timeline cares
 * about (a task created on a company, and a task completed). Every mutation
 * revalidates the dashboard and the global Tasks page so both stay live.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v.length ? v : null;
}

function revalidate(accountId?: string | null) {
  revalidatePath("/crm");
  revalidatePath("/crm/tasks");
  if (accountId) revalidatePath(`/crm/accounts/${accountId}`);
}

/** Every field EXCEPT assigned_user_id — that one has its own admin-gated
 * resolution shared by create/update (see resolveAssignee below). */
function taskFieldsFromForm(fd: FormData) {
  return {
    title: str(fd, "title"),
    notes: optStr(fd, "notes"),
    due_at: optStr(fd, "due_at"),
    priority: normalizePriority(str(fd, "priority")),
    reminder_at: optStr(fd, "reminder_at"),
    account_id: optStr(fd, "account_id"),
    contact_id: optStr(fd, "contact_id"),
  };
}

/**
 * Create a task, optionally linked to a company and/or contact — both are
 * now optional (a task can stand alone). Assignment defaults to the creator
 * when the form leaves it blank, so a new task always lands in someone's
 * queue. Non-admins can only ever create a task assigned to themselves — the
 * UI already locks this (TaskDialog shows a read-only "You"), but a tampered
 * request must still be rejected here, not silently corrected. Logs a
 * task_created activity to the company timeline when a company is linked.
 */
export async function createTask(formData: FormData): Promise<ActionResult> {
  const user = await requireCrmUser();
  const fields = taskFieldsFromForm(formData);
  if (!fields.title) return { ok: false, error: "Task title is required." };

  const rawAssignee = optStr(formData, "assigned_user_id");
  if (rawAssignee && user.role !== "owner" && rawAssignee !== user.id) {
    return { ok: false, error: "Only an admin can assign tasks to someone else." };
  }
  const assignedUserId = rawAssignee ?? user.id;

  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_tasks").insert({
    org_id: user.orgId,
    account_id: fields.account_id,
    contact_id: fields.contact_id,
    title: fields.title,
    notes: fields.notes,
    due_at: fields.due_at,
    priority: fields.priority,
    reminder_at: fields.reminder_at,
    assigned_user_id: assignedUserId,
    status: "open",
  });

  if (error) {
    return { ok: false, error: "Could not save the task. Please try again." };
  }

  if (fields.account_id) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: fields.account_id,
      kind: CRM_ACTIVITY.taskCreated,
      summary: `Task added: ${fields.title}`,
    });
  }

  revalidate(fields.account_id);
  return { ok: true };
}

/**
 * Update an existing task's editable fields. assigned_user_id is only
 * touched when the form actually included it (owner: a real select, always
 * present; non-owner: intentionally OMITTED by TaskDialog so a non-admin
 * editing someone else's task can never accidentally reassign it just by
 * saving a title/notes change) — checked via FormData.has, not a falsy value,
 * since "" (Unassigned) is a legitimate value an owner can submit.
 */
export async function updateTask(
  taskId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const fields = taskFieldsFromForm(formData);
  if (!fields.title) return { ok: false, error: "Task title is required." };

  const updates: Record<string, unknown> = {
    title: fields.title,
    notes: fields.notes,
    due_at: fields.due_at,
    priority: fields.priority,
    reminder_at: fields.reminder_at,
    account_id: fields.account_id,
    contact_id: fields.contact_id,
  };

  if (formData.has("assigned_user_id")) {
    const rawAssignee = optStr(formData, "assigned_user_id");
    if (user.role !== "owner" && rawAssignee !== user.id) {
      return { ok: false, error: "Only an admin can assign tasks to someone else." };
    }
    updates.assigned_user_id = rawAssignee;
  }

  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_tasks").update(updates).eq("id", taskId);

  if (error) {
    return { ok: false, error: "Could not update the task. Please try again." };
  }

  revalidate(fields.account_id);
  return { ok: true };
}

/**
 * Mark a task complete: set status + completed_at and log a task_completed
 * activity. Reads the task first (RLS-scoped) so a completion works from
 * anywhere (the global list or a company profile) without the caller passing
 * the title or account back in.
 */
export async function completeTask(taskId: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: task } = await supabase
    .from("crm_tasks")
    .select("title, account_id, status")
    .eq("id", taskId)
    .maybeSingle();

  const { error } = await supabase
    .from("crm_tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error) {
    return { ok: false, error: "Could not complete the task." };
  }

  const accountId = (task?.account_id as string | null) ?? null;
  if (accountId) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId,
      kind: CRM_ACTIVITY.taskCompleted,
      summary: `Task completed: ${(task?.title as string) ?? "Task"}`,
    });
  }

  revalidate(accountId);
  return { ok: true };
}

/** Reopen a completed task (clears completed_at). No activity is logged. */
export async function reopenTask(taskId: string): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: task } = await supabase
    .from("crm_tasks")
    .select("account_id")
    .eq("id", taskId)
    .maybeSingle();

  const { error } = await supabase
    .from("crm_tasks")
    .update({ status: "open", completed_at: null })
    .eq("id", taskId);

  if (error) return { ok: false, error: "Could not reopen the task." };

  revalidate((task?.account_id as string | null) ?? null);
  return { ok: true };
}

/**
 * Soft-delete a task (set deleted_at). Tasks are operational — allowed for
 * any CRM user, no role gate (unlike company/contact/deal deletes).
 */
export async function deleteTask(
  taskId: string,
  accountId: string | null,
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error) return { ok: false, error: "Could not delete the task." };

  revalidate(accountId);
  return { ok: true };
}
