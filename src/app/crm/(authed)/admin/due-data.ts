import { createCrmServerClient } from "@/lib/crm/auth";
import type { DueTaskRow } from "./dueReport";

/**
 * Server-side read for Admin -> Overview's due-date readout: every OPEN task
 * in the org, with its due date, its owner, and the company it hangs off.
 *
 * Org-wide by design — this is the owner's management view, and the whole
 * point is seeing the tasks that are NOT theirs. RLS still scopes it to the
 * org; nothing here reaches past it.
 *
 * Names are resolved against the same active-profile roster the assignment
 * board loads, so a person appears with the same name on both halves of the
 * page.
 */
export async function getOpenTasksForReport(): Promise<DueTaskRow[]> {
  const supabase = await createCrmServerClient();

  const { data: taskData } = await supabase
    .from("crm_tasks")
    .select("id, title, due_at, assigned_user_id, account_id")
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

  return tasks.map((t) => {
    const accountId = (t.account_id as string | null) ?? null;
    return {
      id: t.id as string,
      title: (t.title as string) || "Untitled task",
      dueAt: (t.due_at as string | null) ?? null,
      assigneeId: (t.assigned_user_id as string | null) ?? null,
      accountId,
      companyName: accountId ? (nameById.get(accountId) ?? null) : null,
    };
  });
}
