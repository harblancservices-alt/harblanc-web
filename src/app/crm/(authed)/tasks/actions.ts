"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { syncFollowupOnTaskChange } from "@/lib/crm/followupTask";
import { normalizePriority } from "./priority";
import { snoozeDays, snoozedDueAt } from "./snooze";
import { centralInputToIso } from "../_shell/format";
import { dueAtForColumn, PLAN_COLUMNS, type PlanColumn } from "./plan";

/**
 * Task writes. Same contract as every CRM mutation: resolve the caller with
 * requireCrmUser(), run through the RLS-scoped client, stamp org_id from the
 * SESSION, and log an append-only activity for the events the timeline cares
 * about (a task created, completed, or reopened). Every mutation revalidates
 * the dashboard and the global Tasks page so both stay live.
 */

/**
 * `reason` lets a caller branch on WHICH rule stopped it without matching on
 * the error string. Only completeTask sets it today.
 *   not_planned   — the task has no due date, so it was never planned
 *   note_required — no close-out note was supplied
 */
export type CompleteBlockReason = "not_planned" | "note_required";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; reason?: CompleteBlockReason };

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
  // Both admin surfaces that report on tasks: the Tasks board (one column
  // per person) and Overview's due-date readout. Added 2026-08-25 with the
  // board — a reassignment that doesn't refresh the screen you did it on is
  // a card that snaps back.
  revalidatePath("/crm/admin/tasks");
  revalidatePath("/crm/admin");
  if (accountId) revalidatePath(`/crm/accounts/${accountId}`);
}

/** Every field EXCEPT assigned_user_id — that one has its own admin-gated
 * resolution shared by create/update (see resolveAssignee below). */
function taskFieldsFromForm(fd: FormData) {
  return {
    title: str(fd, "title"),
    notes: optStr(fd, "notes"),
    task_type: optStr(fd, "task_type"),
    // due_at/reminder_at come in as a datetime-local value the dialog shows
    // in Central time (toDatetimeLocal) — must be converted back through the
    // same Central interpretation, not stored as a naive/UTC string.
    due_at: centralInputToIso(optStr(fd, "due_at")),
    priority: normalizePriority(str(fd, "priority")),
    reminder_at: centralInputToIso(optStr(fd, "reminder_at")),
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
    task_type: fields.task_type,
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
    task_type: fields.task_type,
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
 * Set ONE open task's due date — nothing else. Drives the Workspace → Tasks
 * planning board's drag between columns (2026-08-25).
 *
 * The caller sends a COLUMN, not a date. The date it maps to is computed
 * server-side by plan.ts::dueAtForColumn, so a tampered request can only ever
 * choose between the four buckets the board offers — it cannot write an
 * arbitrary timestamp through this path. `inbox` clears the date, which is a
 * real plan ("I haven't decided when"), not an error.
 *
 * ONLY YOUR OWN TASKS, unless you're an admin. The board is a personal
 * planning surface; rescheduling someone else's work from it would be
 * invisible to them.
 *
 * AN AGENT MAY PUSH A DATE AN ADMIN SET. Deliberate, and worth stating:
 * crm_tasks has one due_at and no record of who set it, so "don't let them
 * move an admin's date" would need a second column to preserve the original
 * — a schema change nobody has asked for. A due date is a due date, whoever
 * set it, and Admin → Tasks always shows the current one.
 */
export async function planTask(taskId: string, column: PlanColumn): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (!PLAN_COLUMNS.includes(column)) {
    return { ok: false, error: "That isn't a column." };
  }

  const supabase = await createCrmServerClient();

  const { data: task } = await supabase
    .from("crm_tasks")
    .select("account_id, assigned_user_id, status")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!task) return { ok: false, error: "That task no longer exists." };

  if (user.role !== "owner" && (task.assigned_user_id as string | null) !== user.id) {
    return { ok: false, error: "You can only plan your own tasks." };
  }

  const dueAt = dueAtForColumn(column);
  const { error } = await supabase.from("crm_tasks").update({ due_at: dueAt }).eq("id", taskId);
  if (error) return { ok: false, error: "Could not move that task. Please try again." };

  // Keep any follow-up this task represents pointing at the new date, the
  // same way snoozeTask does — otherwise the dashboard and calendar would go
  // on showing the old one. "reopened" is that module's verb for "still open,
  // just due at a different time" (see snoozeTask's note). Dropping into the
  // inbox passes null, which correctly leaves the follow-up with no date
  // rather than a stale one.
  await syncFollowupOnTaskChange(supabase, taskId, "reopened", dueAt);

  revalidate((task.account_id as string | null) ?? null);
  return { ok: true };
}

/**
 * Move ONE task to a different owner — nothing else. Drives Admin -> Tasks'
 * drag-and-drop (2026-08-25), and lives here rather than in a board-specific
 * actions file so every crm_tasks write in the CRM stays in one module,
 * behind one org guard and one revalidate().
 *
 * Deliberately NOT updateTask(). That takes a whole FormData and rewrites
 * every column on it; a drag knows one thing (the new owner) and would have
 * to round-trip title/notes/due/priority/links just to avoid blanking them.
 * A gesture that carries one fact should write one column.
 *
 * `assigneeId: null` drops the task back into the unassigned pile — a real
 * move, not an error.
 *
 * DOES NOT TOUCH THE COMPANY'S OWNER, deliberately. Step 2's flow runs the
 * other way: assigning a COMPANY (admin/assign-actions.ts::assignCompanies)
 * sets crm_accounts.assigned_user_id and drags that company's open tasks
 * along with it. Keeping the reverse direction closed means ownership has
 * exactly one source of truth and one place it can be changed, instead of a
 * small gesture on a task silently rewriting who owns a whole account. An
 * admin routinely hands one task about someone else's company to whoever has
 * room; that must not transfer the account.
 */
export async function reassignTask(
  taskId: string,
  assigneeId: string | null,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only an admin can assign tasks to someone else." };
  }

  const supabase = await createCrmServerClient();

  // The target must be a real, ACTIVE member of the caller's own org — never
  // trusted off the wire. Suspending a member reassigns their companies
  // (admin/actions.ts::suspendAndReassignMember); dropping fresh work onto
  // that same account afterwards would quietly undo it.
  if (assigneeId) {
    const { data: person } = await supabase
      .from("crm_profiles")
      .select("id")
      .eq("id", assigneeId)
      .eq("org_id", user.orgId)
      .eq("is_active", true)
      .maybeSingle();
    if (!person) return { ok: false, error: "That person isn't on this org." };
  }

  // Read first so the revalidate below can reach the company's own timeline,
  // and so a missing/out-of-org task fails loudly instead of updating zero
  // rows and reporting success.
  const { data: task } = await supabase
    .from("crm_tasks")
    .select("account_id")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!task) return { ok: false, error: "That task no longer exists." };

  const { error } = await supabase
    .from("crm_tasks")
    .update({ assigned_user_id: assigneeId })
    .eq("id", taskId);

  if (error) return { ok: false, error: "Could not move that task. Please try again." };

  revalidate((task.account_id as string | null) ?? null);
  return { ok: true };
}

/**
 * Mark a task complete: set status + completed_at and log a task_completed
 * activity carrying the REQUIRED completion NOTE as that activity's body,
 * which is where "what has this person actually done" is answered. Append-only
 * by construction, so it cannot be edited away later the way a task column
 * could. See the `note` parameter.
 *
 * THE ONE COMPLETION PATH. Six callers reach it (the Tasks board, the agent
 * dashboard, TaskRow, the desktop and mobile follow-up banners, and the
 * log-a-call flow) and nothing else writes crm_tasks.status = 'completed'.
 * That is deliberate and worth keeping: a future "you must say what happened"
 * rule has exactly one place to live.
 *
 * The original description follows.
 *
 * Sets status + completed_at and logs a task_completed activity — linked to both the task's company AND its contact (whichever
 * are set; a contact-only task with no account still gets logged, it just
 * won't show on a company timeline that doesn't exist). Reads the task first
 * (RLS-scoped) so a completion works from anywhere (the global list, the
 * dashboard queue, or a company profile) without the caller passing the
 * title/account/contact back in.
 */
export async function completeTask(
  taskId: string,
  /**
   * What actually happened — recorded as the task_completed activity's body.
   *
   * REQUIRED as of 2026-08-26. Enforced HERE rather than in a dialog, because
   * this function is the single path all six completion entry points use, so
   * no caller can route around it — a tampered request is refused the same as
   * a careless one.
   */
  note?: string | null,
  /**
   * "YYYY-MM-DD" — plans an UNDATED task as part of closing it, so the
   * close-out dialog can take the date and the note in one step instead of
   * refusing and sending the person away to drag a card first.
   *
   * A DATE, not a timestamp: the caller picks a day, the server decides the
   * instant (Central midday, matching every other due-date write in the CRM),
   * so a tampered request cannot smuggle in an arbitrary moment. Ignored when
   * the task already has a date — closing something must never silently
   * rewrite a date somebody planned.
   */
  plannedFor?: string | null,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: task } = await supabase
    .from("crm_tasks")
    .select("title, account_id, contact_id, status, due_at")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "That task no longer exists." };

  // Only ever used when the task has no date of its own.
  const backfillDueAt = task.due_at
    ? null
    : centralInputToIso(plannedFor?.trim() ? `${plannedFor.trim()}T12:00` : null);

  /**
   * TWO STANDARDS, both enforced here (Brent, 2026-08-26).
   *
   * 1. YOU CANNOT CLOSE WORK YOU NEVER PLANNED. A task with no due_at was
   *    never scheduled — it is sitting in the agent's Inbox. Dragging it onto
   *    a day is the gesture that plans it, and that has to happen before it
   *    can be closed, or "planned" means nothing and the Inbox becomes a
   *    place work quietly passes through on its way to done.
   *
   *    Deliberately "has a date NOW" rather than "ever had one": crm_tasks
   *    keeps no history of when a date was first set, so "ever" is not a
   *    question the schema can answer without a new column. The stricter
   *    reading needs no schema change and is the one Brent described.
   *
   * 2. YOU CANNOT CLOSE WORK WITHOUT SAYING WHAT HAPPENED. The note lands in
   *    the task_completed activity's body, which is append-only — so "what
   *    has this person actually done" finally has an answer beyond a count.
   *
   * Order matters: planning is checked first because it is the structural
   * problem. Telling someone their note is missing, then telling them the
   * task was never planned, is two round trips for one broken state.
   */
  if (!task.due_at && !backfillDueAt) {
    return {
      ok: false,
      reason: "not_planned",
      error: "Say which day this was for before closing it.",
    };
  }
  if (!note?.trim()) {
    return {
      ok: false,
      reason: "note_required",
      error: "Say what happened before closing this.",
    };
  }

  // ONE write. The date, the status and the completion stamp land together,
  // so a task can never end up dated-but-open (or worse, closed with the
  // date write having failed) because of a half-applied two-step.
  const { error } = await supabase
    .from("crm_tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      ...(backfillDueAt ? { due_at: backfillDueAt } : {}),
    })
    .eq("id", taskId);

  if (error) {
    return { ok: false, error: "Could not complete the task." };
  }

  // Reverse-sync: if this task is what a contact/call's follow-up currently
  // points at, clear its active follow-up state so it stops double-counting
  // on the Dashboard/Calendar now that the underlying task is done. See
  // syncFollowupOnTaskChange's own comment for the staleness guard.
  await syncFollowupOnTaskChange(supabase, taskId, "completed", null);

  const accountId = (task?.account_id as string | null) ?? null;
  const contactId = (task?.contact_id as string | null) ?? null;
  if (accountId || contactId) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId,
      contactId,
      kind: CRM_ACTIVITY.taskCompleted,
      summary: `Task completed: ${(task?.title as string) ?? "Task"}`,
      // The evidence. Guaranteed non-empty by the guard above.
      body: note!.trim(),
    });
  }

  revalidate(accountId);
  return { ok: true };
}

/**
 * Reopen a completed task (clears completed_at) and log a task_reopened
 * activity — same company/contact linkage as completeTask, so the timeline
 * reads symmetrically ("Task completed: X" then later "Task reopened: X").
 */
export async function reopenTask(taskId: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: task } = await supabase
    .from("crm_tasks")
    .select("title, account_id, contact_id, due_at")
    .eq("id", taskId)
    .maybeSingle();

  const { error } = await supabase
    .from("crm_tasks")
    .update({ status: "open", completed_at: null })
    .eq("id", taskId);

  if (error) return { ok: false, error: "Could not reopen the task." };

  // Reverse-sync: restore the follow-up state this task represents (if any)
  // back to this task's own due date — symmetric with completeTask.
  await syncFollowupOnTaskChange(supabase, taskId, "reopened", (task?.due_at as string | null) ?? null);

  const accountId = (task?.account_id as string | null) ?? null;
  const contactId = (task?.contact_id as string | null) ?? null;
  if (accountId || contactId) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId,
      contactId,
      kind: CRM_ACTIVITY.taskReopened,
      summary: `Task reopened: ${(task?.title as string) ?? "Task"}`,
    });
  }

  revalidate(accountId);
  return { ok: true };
}

/**
 * Push an open task's due date out by a preset (+1 day / +3 days / next
 * week) — the task card's amber Snooze dropdown. Writes due_at ONLY: no
 * status change, no full form, no other field touched, so a snooze can never
 * silently undo an edit the rep made from the dialog.
 *
 * The preset key is re-validated here via snoozeDays() rather than trusting
 * a number off the wire — a tampered request can't push a task an arbitrary
 * distance out. Date math lives in tasks/snooze.ts (shared with the client
 * card, which renders the same preset list).
 *
 * Reverse-syncs like every other task status write: if this task is what a
 * contact's or call's follow-up points at, that follow-up date moves with it
 * — "reopened" is the right verb for syncFollowupOnTaskChange here (the task
 * stays open and actively due, just later), so the Dashboard/Calendar don't
 * keep showing the old date.
 */
export async function snoozeTask(taskId: string, preset: string): Promise<ActionResult> {
  await requireCrmUser();

  const days = snoozeDays(preset);
  if (days === null) return { ok: false, error: "That snooze option isn't available." };

  const supabase = await createCrmServerClient();

  const { data: task } = await supabase
    .from("crm_tasks")
    .select("due_at, account_id")
    .eq("id", taskId)
    .maybeSingle();

  const nextDue = snoozedDueAt((task?.due_at as string | null) ?? null, days);
  if (!nextDue) return { ok: false, error: "Could not work out the new due date." };

  const { error } = await supabase.from("crm_tasks").update({ due_at: nextDue }).eq("id", taskId);
  if (error) return { ok: false, error: "Could not snooze the task." };

  await syncFollowupOnTaskChange(supabase, taskId, "reopened", nextDue);

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

  // Reverse-sync: a deleted task is gone for good, so unlike complete/reopen
  // this also clears the pointer itself (nothing to "restore" later).
  await syncFollowupOnTaskChange(supabase, taskId, "deleted", null);

  revalidate(accountId);
  return { ok: true };
}
