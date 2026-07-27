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

function taskFieldsFromForm(fd: FormData) {
  return {
    title: str(fd, "title"),
    notes: optStr(fd, "notes"),
    due_at: optStr(fd, "due_at"),
    priority: normalizePriority(str(fd, "priority")),
    reminder_at: optStr(fd, "reminder_at"),
    assigned_user_id: optStr(fd, "assigned_user_id"),
  };
}

/**
 * Create a task on a company. Assignment defaults to the creator when the form
 * leaves it blank, so a new task always lands in someone's queue. Logs a
 * task_created activity to the company timeline.
 */
export async function createTask(
  accountId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const fields = taskFieldsFromForm(formData);
  if (!fields.title) return { ok: false, error: "Task title is required." };

  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_tasks").insert({
    org_id: user.orgId,
    account_id: accountId,
    title: fields.title,
    notes: fields.notes,
    due_at: fields.due_at,
    priority: fields.priority,
    reminder_at: fields.reminder_at,
    assigned_user_id: fields.assigned_user_id ?? user.id,
    status: "open",
  });

  if (error) {
    return { ok: false, error: "Could not save the task. Please try again." };
  }

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.taskCreated,
    summary: `Task added: ${fields.title}`,
  });

  revalidate(accountId);
  return { ok: true };
}

/** Update an existing task's editable fields. */
export async function updateTask(
  taskId: string,
  accountId: string | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireCrmUser();
  const fields = taskFieldsFromForm(formData);
  if (!fields.title) return { ok: false, error: "Task title is required." };

  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_tasks")
    .update({
      title: fields.title,
      notes: fields.notes,
      due_at: fields.due_at,
      priority: fields.priority,
      reminder_at: fields.reminder_at,
      assigned_user_id: fields.assigned_user_id,
    })
    .eq("id", taskId);

  if (error) {
    return { ok: false, error: "Could not update the task. Please try again." };
  }

  revalidate(accountId);
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
  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.taskCompleted,
    summary: `Task completed: ${(task?.title as string) ?? "Task"}`,
  });

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

/** Delete a task outright (tasks are operational, not part of the audit trail). */
export async function deleteTask(
  taskId: string,
  accountId: string | null,
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase.from("crm_tasks").delete().eq("id", taskId);
  if (error) return { ok: false, error: "Could not delete the task." };

  revalidate(accountId);
  return { ok: true };
}
