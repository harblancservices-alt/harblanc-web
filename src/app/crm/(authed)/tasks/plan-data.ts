import { createCrmServerClient, type CrmUser } from "@/lib/crm/auth";
import { titleCaseWords, centralDayRange } from "../_shell/format";
import {
  getCompanyVisibility,
  applyCompanyVisibility,
} from "../_shell/companyVisibility";
import type { PlanTask } from "./plan";

/**
 * Server-side reads for Workspace → Tasks, the planning board. Scoped to ONE
 * person — the signed-in user — on both queries. This is their own work, not
 * a management view; the org-wide read lives at Admin → Tasks.
 *
 * PROVENANCE, and what the schema can actually answer. The approved mockup
 * shows lines like "assigned by Brent", "from OTR" and "from BOL Center"
 * under a card. crm_tasks has NO created_by / assigned_by column, and
 * crm_activities carries no task_id, so there is no way to say who put a task
 * in someone's queue — and no honest way to fake it. What IS stored is
 * crm_tasks.task_type ("Research prospect", "Cold call" — see taskType.ts),
 * so that is what the card shows, verbatim. See the report: the rest needs a
 * column, which is a schema change nobody has authorised.
 */

export type PlanData = {
  tasks: PlanTask[];
  companies: { id: string; name: string }[];
  /** Tasks this person completed since the start of the current week. */
  doneThisWeek: number;
  /** Server clock, stamped here rather than in a component body — Date.now()
   * during render is impure and the React Compiler rejects it outright. */
  now: number;
};

const DAY_MS = 86_400_000;

export async function getPlanData(user: CrmUser): Promise<PlanData> {
  const supabase = await createCrmServerClient();
  const visibility = await getCompanyVisibility(user);

  // Monday-anchored week for the "done this week" counter, computed off the
  // same Central day boundary everything else in the CRM splits on.
  const { startMs } = centralDayRange();
  const dayOfWeek = new Date(startMs).getUTCDay(); // 0 = Sunday
  const weekStartMs = startMs - ((dayOfWeek + 6) % 7) * DAY_MS;

  let companiesQuery = supabase
    .from("crm_accounts")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(1000);
  companiesQuery = applyCompanyVisibility(companiesQuery, visibility);

  const [openRes, doneRes, companiesRes] = await Promise.all([
    supabase
      .from("crm_tasks")
      .select("id, title, due_at, task_type, account_id")
      .eq("status", "open")
      .eq("assigned_user_id", user.id)
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(500),
    supabase
      .from("crm_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .eq("assigned_user_id", user.id)
      .is("deleted_at", null)
      .gte("completed_at", new Date(weekStartMs).toISOString()),
    companiesQuery,
  ]);

  const openTasks = openRes.data ?? [];

  // A task can point at a company outside this person's own book — an admin
  // can send one about anything. The NAME is still resolved (a card reading
  // "No company" is not actionable), with a second lookup for any id the
  // scoped roster above doesn't cover. Nothing is leaked by it: the filter is
  // on the company LIST, not on whether one company can be opened.
  const scoped = new Map(
    ((companiesRes.data ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]),
  );
  const missing = [
    ...new Set(
      openTasks
        .map((t) => (t.account_id as string | null) ?? null)
        .filter((id): id is string => id !== null && !scoped.has(id)),
    ),
  ];
  const nameById = new Map(scoped);
  if (missing.length) {
    const { data } = await supabase
      .from("crm_accounts")
      .select("id, name")
      .in("id", missing)
      .is("deleted_at", null);
    for (const a of data ?? []) nameById.set(a.id as string, a.name as string);
  }

  const tasks: PlanTask[] = openTasks.map((t) => {
    const accountId = (t.account_id as string | null) ?? null;
    const type = ((t.task_type as string | null) ?? "").trim();
    return {
      id: t.id as string,
      title: (t.title as string) || "Untitled task",
      dueAt: (t.due_at as string | null) ?? null,
      accountId: accountId && nameById.has(accountId) ? accountId : null,
      companyName: accountId ? (nameById.get(accountId) ?? null) : null,
      provenance: type.length ? type.toLowerCase() : null,
    };
  });

  return {
    tasks,
    companies: ((companiesRes.data ?? []) as { id: string; name: string }[]).map((a) => ({
      id: a.id,
      name: titleCaseWords(a.name),
    })),
    doneThisWeek: doneRes.count ?? 0,
    now: Date.now(),
  };
}
