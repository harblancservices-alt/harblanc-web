"use server";

import { revalidatePath } from "next/cache";
import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";
import { parseItemKey, type WorkSource } from "./workItem";

/**
 * Writes for the Admin → Overview assignment board.
 *
 * OWNER-ONLY. Handing another person work is an admin act, and the existing
 * task layer already refuses cross-assignment for non-owners
 * (tasks/actions.ts). Enforced here rather than only in the UI: a tampered
 * request has to be rejected, not silently narrowed.
 *
 * WHAT CAN ACTUALLY BE OWNED. Only crm_accounts has an assignee column
 * (assigned_user_id). crm_otr_entries and crm_bol_entries do not, so those
 * cannot record an owner at all. Rather than fail half a mixed selection
 * silently, assigning one of them creates an assigned crm_task — the closest
 * mechanism that already exists — so the work still reaches the person. The
 * result says exactly which of the two happened, per item.
 */

export type AssignResult =
  | { ok: true; claimed: number; tasked: number }
  | { ok: false; error: string };

export type TaskResult = { ok: true } | { ok: false; error: string };

/** Titles for the fallback task, written as the instruction an agent reads. */
const FALLBACK_TITLE: Record<Exclude<WorkSource, "prospect">, (company: string) => string> = {
  otr: (c) => `Research and release ${c} (OTR)`,
  bol: (c) => `Match the companies on the ${c} bill of lading`,
};

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
        contact_id: null,
        title: t.title,
        notes: null,
        task_type: t.task_type,
        due_at: t.due_at,
        priority: "normal",
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

  // ── 2. Create the tasks ───────────────────────────────────────────────
  const inserted = await insertTasks(
    supabase,
    user.orgId,
    needTask.map((id) => ({
      account_id: id,
      title,
      task_type: task.taskType,
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

export async function assignWork(personId: string, keys: string[]): Promise<AssignResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") return { ok: false, error: "Only an admin can hand out work." };
  if (!personId) return { ok: false, error: "Pick someone to assign this to." };
  if (keys.length === 0) return { ok: false, error: "Nothing is selected." };

  const supabase = await createCrmServerClient();

  // The assignee must be a real, active member of THIS org — never trust an
  // id off the wire.
  const { data: person } = await supabase
    .from("crm_profiles")
    .select("id")
    .eq("id", personId)
    .eq("org_id", user.orgId)
    .eq("is_active", true)
    .maybeSingle();
  if (!person) return { ok: false, error: "That person isn't on this org." };

  const parsed = keys.map(parseItemKey);
  const prospectIds = parsed.filter((p) => p.source === "prospect").map((p) => p.id);
  const fallbacks = parsed.filter((p) => p.source !== "prospect");

  const owned = await setAccountOwner(supabase, prospectIds, personId);
  if (!owned.ok) return { ok: false, error: "Could not assign those companies. Please try again." };
  const claimed = owned.count;

  let tasked = 0;
  if (fallbacks.length > 0) {
    // One read per source to get the names the task titles need. Two queries
    // total regardless of how many items are selected.
    const otrIds = fallbacks.filter((f) => f.source === "otr").map((f) => f.id);
    const bolIds = fallbacks.filter((f) => f.source === "bol").map((f) => f.id);

    const [otrRows, bolRows] = await Promise.all([
      otrIds.length
        ? supabase.from("crm_otr_entries").select("id, company_name").in("id", otrIds)
        : Promise.resolve({ data: [] as { id: string; company_name: string }[] }),
      bolIds.length
        ? supabase.from("crm_bol_entries").select("id, shipper_name").in("id", bolIds)
        : Promise.resolve({ data: [] as { id: string; shipper_name: string | null }[] }),
    ]);

    const nameById = new Map<string, string>();
    for (const r of otrRows.data ?? []) nameById.set(r.id as string, (r.company_name as string) || "a company");
    for (const r of bolRows.data ?? []) nameById.set(r.id as string, (r.shipper_name as string) || "a shipment");

    const result = await insertTasks(
      supabase,
      user.orgId,
      fallbacks.map((f) => ({
        account_id: null,
        title: FALLBACK_TITLE[f.source as "otr" | "bol"](nameById.get(f.id) ?? "a company"),
        task_type: null,
        // UNDATED, matching assignCompanies above. These briefly carried a
        // 3-day default so they couldn't hide from Admin → Overview's
        // deadline readout; that readout is gone and the rule is now the
        // other way round — an admin hands work over, the agent dates it.
        due_at: null,
        assigned_user_id: personId,
      })),
    );
    if (!result.ok) {
      // The prospect half already landed — say so rather than reporting a
      // clean failure for a partially-applied action.
      return {
        ok: false,
        error:
          claimed > 0
            ? `Assigned ${claimed} ${claimed === 1 ? "company" : "companies"}, but could not create the tasks for the OTR/BOL items.`
            : "Could not create those tasks. Please try again.",
      };
    }
    tasked = result.ids.length;
  }

  revalidatePath("/crm/admin");
  return { ok: true, claimed, tasked };
}

/** The task composer. crm_tasks carries assigned_user_id, due_at and
 * account_id, so every field on the composer persists for real. */
export async function sendTask(input: {
  title: string;
  assignedUserId: string;
  dueAt: string | null;
  accountId: string | null;
}): Promise<TaskResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner" && input.assignedUserId !== user.id) {
    return { ok: false, error: "Only an admin can assign tasks to someone else." };
  }
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the task a title." };
  if (!input.assignedUserId) return { ok: false, error: "Pick who it's for." };

  const supabase = await createCrmServerClient();
  const result = await insertTasks(supabase, user.orgId, [
    {
      account_id: input.accountId,
      title,
      task_type: null,
      due_at: input.dueAt,
      assigned_user_id: input.assignedUserId,
    },
  ]);

  if (!result.ok) return { ok: false, error: "Could not send the task. Please try again." };

  revalidatePath("/crm/admin");
  return { ok: true };
}
