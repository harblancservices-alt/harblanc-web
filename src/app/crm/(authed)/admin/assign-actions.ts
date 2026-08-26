"use server";

import { revalidatePath } from "next/cache";
import { batchTaskSpec, assignmentBrief, assignmentDoneWhen } from "./companies/assignmentTask";
import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";
import { normalizePriority } from "../tasks/priority";

/**
 * Writes for the Admin → Overview assignment board.
 *
 * OWNER-ONLY. Handing another person work is an admin act, and the existing
 * task layer already refuses cross-assignment for non-owners
 * (tasks/actions.ts). Enforced here rather than only in the UI: a tampered
 * request has to be rejected, not silently narrowed.
 *
 * EVERYTHING IN THE POOL CAN BE OWNED, AS OF 2026-08-26. This file used to
 * carry a fallback: crm_otr_entries and crm_bol_entries have no assignee
 * column, so assigning one of those created an assigned crm_task instead —
 * the closest mechanism that already existed. Both funnels are gone and the
 * pool is nothing but crm_accounts rows now, every one of which has
 * assigned_user_id. The fallback and its two title builders went with them.
 */

export type AssignResult =
  | { ok: true; claimed: number; tasked: number }
  | { ok: false; error: string };

export type TaskResult = { ok: true } | { ok: false; error: string };

/**
 * The ONE place crm_accounts.assigned_user_id is written by an admin. Both
 * the work board (which assigns released prospects) and the Companies tab
 * (which reassigns any company) go through it, so "assign a company" has a
 * single definition rather than one per screen.
 *
 * Returns the number of rows actually updated — never the number requested —
 * so a caller can't report success for a row that was soft-deleted or moved
 * out from under it.
 */
async function setAccountOwner(
  supabase: Awaited<ReturnType<typeof createCrmServerClient>>,
  accountIds: string[],
  personId: string,
): Promise<{ ok: true; count: number } | { ok: false }> {
  if (accountIds.length === 0) return { ok: true, count: 0 };
  const { data, error } = await supabase
    .from("crm_accounts")
    .update({ assigned_user_id: personId })
    .in("id", accountIds)
    .is("deleted_at", null)
    .select("id");
  if (error) return { ok: false };
  return { ok: true, count: data?.length ?? 0 };
}

/** Shared guard: caller is an owner and the assignee is a real active member
 * of THIS org. Never trust an id off the wire. */
async function requireAdminAndAssignee(
  personId: string,
): Promise<{ ok: true; supabase: Awaited<ReturnType<typeof createCrmServerClient>> } | { ok: false; error: string }> {
  const user = await requireCrmUser();
  if (user.role !== "owner") return { ok: false, error: "Only an admin can hand out work." };
  if (!personId) return { ok: false, error: "Pick someone to assign this to." };

  const supabase = await createCrmServerClient();
  const { data: person } = await supabase
    .from("crm_profiles")
    .select("id")
    .eq("id", personId)
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .maybeSingle();
  if (!person) return { ok: false, error: "That person isn't on this org." };
  return { ok: true, supabase };
}

/**
 * The ONE place crm_tasks rows are inserted by these actions — shared by the
 * composer's sendTask() and by company assignment, so "create a task" has a
 * single shape (status 'open', priority 'normal', org from the session).
 */
type NewTask = {
  account_id: string | null;
  title: string;
  task_type: string | null;
  due_at: string | null;
  assigned_user_id: string;
  /** The brief — crm_tasks.notes. Optional; assignment leaves it null. */
  notes?: string | null;
  contact_id?: string | null;
  /** low/normal/high (tasks/priority.ts). Omitted means 'normal'. */
  priority?: string | null;
  definition_of_done?: string | null;
};

async function insertTasks(
  supabase: Awaited<ReturnType<typeof createCrmServerClient>>,
  orgId: string,
  tasks: NewTask[],
): Promise<{ ok: true; ids: string[] } | { ok: false }> {
  if (tasks.length === 0) return { ok: true, ids: [] };
  const { data, error } = await supabase
    .from("crm_tasks")
    .insert(
      tasks.map((t) => ({
        org_id: orgId,
        account_id: t.account_id,
        contact_id: t.contact_id ?? null,
        title: t.title,
        notes: t.notes ?? null,
        task_type: t.task_type,
        due_at: t.due_at,
        priority: normalizePriority(t.priority),
        definition_of_done: t.definition_of_done ?? null,
        reminder_at: null,
        assigned_user_id: t.assigned_user_id,
        status: "open",
      })),
    )
    .select("id");
  if (error) return { ok: false };
  return { ok: true, ids: (data ?? []).map((r) => r.id as string) };
}

export type AssignCompaniesResult =
  | {
      ok: true;
      /** Companies whose owner actually changed. */
      claimed: number;
      /** New tasks created. */
      tasked: number;
      /** Companies skipped because an open task of this kind already existed. */
      alreadyHadTask: number;
      /** Pre-existing open tasks moved to the new owner with the company. */
      movedTasks: number;
      /** Set when the ownership+task writes succeeded but moving older tasks
       * did not — a partial state the caller must be able to report. */
      warning?: string;
    }
  | { ok: false; error: string };

/**
 * Admin → Companies: hand a set of companies to an agent and put the work in
 * their queue.
 *
 * Step 2, amended 2026-08-25. A company cannot be worked; a task can. So
 * assignment writes the owner AND creates a task. That task is now created
 * UNDATED: it lands in the agent's Inbox on Workspace → Tasks and they drag
 * it onto a day. It briefly carried a 3-day default, which meant every
 * assignment arrived already planned into a day column and the Inbox this
 * board was built around was never actually the destination for assigned
 * work. An undated task is UNPLANNED, not overdue.
 *
 * ATOMICITY, honestly. The Supabase JS client has no transaction API, and a
 * real one would mean a Postgres function — a schema change, which is out of
 * scope. So this is ordered so the two writes the instruction cares about
 * (owner and task) are all-or-nothing via a compensating rollback:
 *
 *   1. read what exists (previous owners, open tasks on these companies)
 *   2. INSERT the new tasks
 *   3. SET the owner — on failure, hard-delete the tasks from (2) and return
 *      a clean error, so neither write survives
 *   4. move pre-existing open tasks to the new owner — least critical, and a
 *      failure here is REPORTED rather than rolled back, because undoing a
 *      successful assignment to fix a bookkeeping move would be worse
 *
 * The rollback in (3) is a HARD delete, not the usual soft delete: those rows
 * are milliseconds old and nobody has seen them, so a soft-deleted ghost of a
 * task that never logically existed would be noise in every future query.
 */
export async function assignCompanies(
  personId: string,
  accountIds: string[],
  /**
   * NO dueAt. Assigned work is created UNDATED on purpose (Brent,
   * 2026-08-25) so it lands in the agent's Inbox on Workspace → Tasks and
   * they plan it onto a day themselves. Everything else about step 2 is
   * unchanged: the task is still created, linked to the company, assigned to
   * the person, titled from the work type and duplicate-guarded.
   */
  task: { title: string; taskType: string },
): Promise<AssignCompaniesResult> {
  if (accountIds.length === 0) return { ok: false, error: "Nothing is selected." };
  const title = task.title.trim();
  if (!title) return { ok: false, error: "Give the task a title." };

  const user = await requireCrmUser();
  const guard = await requireAdminAndAssignee(personId);
  if (!guard.ok) return { ok: false, error: guard.error };
  const supabase = guard.supabase;

  // ── 1. What already exists ────────────────────────────────────────────
  const { data: openTaskRows } = await supabase
    .from("crm_tasks")
    .select("id, account_id, task_type, assigned_user_id")
    .in("account_id", accountIds)
    .eq("status", "open")
    .is("deleted_at", null);

  const openTasks = openTaskRows ?? [];

  // Duplicate guard: same KIND (task_type) on the same company. Reassigning a
  // company must not stack a second identical task on it.
  const alreadyHasKind = new Set(
    openTasks
      .filter((t) => (t.task_type as string | null) === task.taskType)
      .map((t) => t.account_id as string),
  );
  const needTask = accountIds.filter((id) => !alreadyHasKind.has(id));

  // ── 1b. What each company actually needs, for the brief ───────────────
  //
  // "Research prospect is silent" (Brent, 2026-08-26): these tasks used to
  // carry a title and nothing else. The brief is derived per company from
  // the SAME facts the dashboard's gaps panel uses (completeness.ts), so
  // the task and the gaps listed beside it can never disagree.
  const { data: factRows } = needTask.length
    ? await supabase
        .from("crm_accounts")
        .select("id, name, city, state, address, industry, phone, lifecycle_status")
        .in("id", needTask)
        .is("deleted_at", null)
    : { data: [] as Record<string, unknown>[] };

  const { data: contactRows } = needTask.length
    ? await supabase
        .from("crm_contacts")
        .select("account_id, name, phone")
        .in("account_id", needTask)
        .is("deleted_at", null)
        .order("name", { ascending: true })
    : { data: [] as Record<string, unknown>[] };

  const contactsByAccount = new Map<string, { name: string; phone: string | null }[]>();
  for (const c of contactRows ?? []) {
    const key = c.account_id as string;
    const list = contactsByAccount.get(key) ?? [];
    list.push({ name: (c.name as string) || "", phone: (c.phone as string | null) ?? null });
    contactsByAccount.set(key, list);
  }

  const factsById = new Map<string, { brief: string | null; doneWhen: string | null }>();
  for (const row of factRows ?? []) {
    const id = row.id as string;
    const people = contactsByAccount.get(id) ?? [];
    const input = {
      id,
      name: (row.name as string) || "",
      city: (row.city as string | null) ?? null,
      state: (row.state as string | null) ?? null,
      address: (row.address as string | null) ?? null,
      industry: (row.industry as string | null) ?? null,
      contactCount: people.length,
    };
    factsById.set(id, {
      brief: assignmentBrief({
        ...input,
        contactName: people[0]?.name ?? null,
        phone: people[0]?.phone ?? (row.phone as string | null) ?? null,
      }),
      doneWhen: assignmentDoneWhen(row.lifecycle_status as string | null, input),
    });
  }

  // ── 2. Create the tasks ───────────────────────────────────────────────
  const inserted = await insertTasks(
    supabase,
    user.orgId,
    needTask.map((id) => ({
      account_id: id,
      title,
      task_type: task.taskType,
      // The brief and the goal, per company — what makes these tasks say
      // something. insertTasks already carried both columns; the automatic
      // path simply never filled them in.
      notes: factsById.get(id)?.brief ?? null,
      definition_of_done: factsById.get(id)?.doneWhen ?? null,
      // Undated — see the `task` parameter. An undated task is UNPLANNED,
      // never overdue: taskUrgencyBucket reads a null due_at as "upcoming",
      // so nothing counts it as late anywhere.
      due_at: null,
      assigned_user_id: personId,
    })),
  );
  if (!inserted.ok) return { ok: false, error: "Could not create the tasks. Nothing was changed." };

  // ── 3. Set the owner, rolling the tasks back if it fails ──────────────
  const owned = await setAccountOwner(supabase, accountIds, personId);
  if (!owned.ok) {
    if (inserted.ids.length > 0) {
      await supabase.from("crm_tasks").delete().in("id", inserted.ids);
    }
    return { ok: false, error: "Could not reassign those companies. Nothing was changed." };
  }

  // ── 4. The company's existing open work follows it ────────────────────
  // A task left with the previous owner points at a company they no longer
  // own — and once agents only see their own companies (step 3) it would be
  // a task they cannot open. One owner per company means one owner for its
  // open work.
  const toMove = openTasks
    .filter((t) => (t.assigned_user_id as string | null) !== personId)
    .map((t) => t.id as string);

  let movedTasks = 0;
  let warning: string | undefined;
  if (toMove.length > 0) {
    const { data: moved, error: moveError } = await supabase
      .from("crm_tasks")
      .update({ assigned_user_id: personId })
      .in("id", toMove)
      .select("id");
    if (moveError) {
      warning = `${toMove.length} existing open ${toMove.length === 1 ? "task" : "tasks"} could not be moved and stayed with the previous owner.`;
    } else {
      movedTasks = moved?.length ?? 0;
    }
  }

  revalidatePath("/crm/admin/companies");
  revalidatePath("/crm/admin");
  revalidatePath("/crm/tasks");
  return {
    ok: true,
    claimed: owned.count,
    tasked: inserted.ids.length,
    alreadyHadTask: alreadyHasKind.size,
    movedTasks,
    warning,
  };
}

/**
 * Admin → Overview's "Assign" button.
 *
 * DELEGATES TO assignCompanies. Both screens now hand out the same kind of
 * thing — an unowned crm_accounts row — so they must do the same thing with
 * it. Before 2026-08-26 this set the owner and stopped there while Admin →
 * Companies also created the work's opening task; that difference was
 * defensible when the pool was a mix of tables that could not all carry an
 * owner, and is just an inconsistency now that it is not.
 *
 * It matters for the OTR companies specifically: Brent's rule is that
 * "research this company" is the task assignment creates, and
 * assignmentTaskSpec already returns exactly that for a source='otr' row. If
 * this path skipped the task, assigning one of those from Overview would
 * silently produce no research task at all, which is the opposite of the
 * rule.
 *
 * The spec is computed HERE from the companies being assigned rather than
 * passed in, because this board deliberately does not carry a task composer —
 * the admin picks a person and presses Assign. It reads their STAGE, so a
 * company already at Contacted or Quoting gets a follow-up rather than being
 * sent back to research.
 */
export async function assignWork(personId: string, accountIds: string[]): Promise<AssignResult> {
  if (accountIds.length === 0) return { ok: false, error: "Nothing is selected." };

  const supabase = await createCrmServerClient();
  const { data: rows } = await supabase
    .from("crm_accounts")
    .select("lifecycle_status")
    .in("id", accountIds)
    .is("deleted_at", null);

  // Stage only — see assignmentTask.ts. A company at Contacted or Quoting
  // gets a follow-up, not "go research this", which is a step already past.
  const spec = batchTaskSpec(
    (rows ?? []).map((r) => ({ stage: (r.lifecycle_status as string | null) ?? null })),
  );

  const result = await assignCompanies(personId, accountIds, spec);
  if (!result.ok) return result;
  return { ok: true, claimed: result.claimed, tasked: result.tasked };
}

/**
 * The task composer on Admin → Overview. EVERY FIELD PERSISTS FOR REAL —
 * crm_tasks already carried assigned_user_id, account_id, contact_id, notes,
 * priority and due_at, and gained definition_of_done on 2026-08-26. Nothing
 * here is decorative.
 *
 * What each field is for, since three of them are easy to confuse:
 *   title              the ACTION      "Call about their reefer volume"
 *   definitionOfDone   the OUTCOME     "got a rate"
 *   notes              the BRIEF       why this exists, context to go in with
 *
 * DUE DATE DEFAULTS TO NONE, matching what assignment does: undated work
 * lands in the agent's Inbox and they plan it. A date is still allowed here,
 * for the case where it genuinely cannot move — and is REQUIRED when the
 * task is flagged high priority, since "urgent, whenever" is not a thing.
 *
 * The CONTACT is re-checked against the chosen company rather than trusted:
 * the picker only offers that company's contacts, but a stale or tampered
 * pairing must not be stored, or a task would point at somebody who doesn't
 * work there.
 */
export async function sendTask(input: {
  title: string;
  assignedUserId: string;
  dueAt: string | null;
  accountId: string | null;
  contactId?: string | null;
  notes?: string | null;
  definitionOfDone?: string | null;
  priority?: string | null;
}): Promise<TaskResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner" && input.assignedUserId !== user.id) {
    return { ok: false, error: "Only an admin can assign tasks to someone else." };
  }
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the task a title." };
  if (!input.assignedUserId) return { ok: false, error: "Pick who it's for." };

  /**
   * HIGH PRIORITY REQUIRES A DATE (Brent, 2026-08-26). Flagging something
   * urgent without saying when it is needed is a contradiction — it tells the
   * agent to drop everything for a thing with no deadline, which is how
   * "urgent" stops meaning anything.
   *
   * Only high. Normal-priority work still lands undated in their Inbox and
   * they plan it themselves; that is the default path and it is unchanged.
   */
  if (normalizePriority(input.priority) === "high" && !input.dueAt) {
    return { ok: false, error: "High priority needs a due date — say when it's needed." };
  }

  const supabase = await createCrmServerClient();

  // A contact only makes sense as "someone AT this company". Verified here,
  // never trusted from the client.
  let contactId = input.contactId?.trim() || null;
  if (contactId) {
    if (!input.accountId) {
      contactId = null;
    } else {
      const { data: contact } = await supabase
        .from("crm_contacts")
        .select("id")
        .eq("id", contactId)
        .eq("account_id", input.accountId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!contact) return { ok: false, error: "That contact isn't at that company." };
    }
  }

  const result = await insertTasks(supabase, user.orgId, [
    {
      account_id: input.accountId,
      title,
      task_type: null,
      due_at: input.dueAt,
      assigned_user_id: input.assignedUserId,
      contact_id: contactId,
      notes: input.notes?.trim() || null,
      definition_of_done: input.definitionOfDone?.trim() || null,
      priority: input.priority,
    },
  ]);

  if (!result.ok) return { ok: false, error: "Could not send the task. Please try again." };

  revalidatePath("/crm/admin");
  return { ok: true };
}
