import { createCrmServerClient } from "@/lib/crm/auth";
import { normalizePriority } from "../tasks/priority";
import type { DueTaskRow } from "./dueReport";

/**
 * Server-side read for Admin -> Tasks: every OPEN task in the org, with its
 * due date, its owner, and the company it hangs off.
 *
 * Org-wide by design — this is the owner's management view, and the whole
 * point is seeing the tasks that are NOT theirs. RLS still scopes it to the
 * org; nothing here reaches past it.
 *
 * Named "...ForReport" because it also fed Admin -> Overview's "Where the
 * work stands" readout until Brent removed that section (2026-08-25). The
 * board is now its only caller; the name is kept so the git history of the
 * query stays greppable.
 */
export type OpenTasksReport = {
  tasks: DueTaskRow[];
  /** Server clock, stamped HERE rather than in a component body — every
   * label on the board is computed against one instant, and `Date.now()`
   * during render is an impure call the React Compiler rejects outright
   * (react-hooks/purity). Same contract as assign-data.ts. */
  now: number;
};

export async function getOpenTasksForReport(): Promise<OpenTasksReport> {
  const supabase = await createCrmServerClient();

  const { data: taskData } = await supabase
    .from("crm_tasks")
    .select("id, title, due_at, assigned_user_id, account_id, priority")
    .eq("status", "open")
    .is("deleted_at", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(1000);

  const tasks = taskData ?? [];
  const accountIds = [
    ...new Set(
      tasks
        .map((t) => (t.account_id as string | null) ?? null)
        .filter((id): id is string => id !== null),
    ),
  ];

  const { data: accountData } = accountIds.length
    ? await supabase.from("crm_accounts").select("id, name").in("id", accountIds)
    : { data: [] as { id: string; name: string }[] };

  const nameById = new Map((accountData ?? []).map((a) => [a.id as string, a.name as string]));

  const rows: DueTaskRow[] = tasks.map((t) => {
    const accountId = (t.account_id as string | null) ?? null;
    return {
      id: t.id as string,
      title: (t.title as string) || "Untitled task",
      dueAt: (t.due_at as string | null) ?? null,
      assigneeId: (t.assigned_user_id as string | null) ?? null,
      accountId,
      companyName: accountId ? (nameById.get(accountId) ?? null) : null,
      isHigh: normalizePriority(t.priority as string | null) === "high",
    };
  });

  return { tasks: rows, now: Date.now() };
}
