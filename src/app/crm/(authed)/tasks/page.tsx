import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, EmptyState } from "../_shell/ui";
import { IconTasks } from "../_shell/icons";
import { TaskRow, type CrmTaskItem } from "./TaskRow";

export const dynamic = "force-dynamic";

type TaskRowData = {
  id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  priority: string | null;
  status: string;
  completed_at: string | null;
  reminder_at: string | null;
  account_id: string | null;
  assigned_user_id: string | null;
};

/**
 * Global Tasks — the rep's own work list (tasks assigned to them, RLS-scoped to
 * their org). Open tasks are grouped Overdue / Due today / Upcoming so the top
 * of the page is always the most urgent work; completed tasks collapse into a
 * closed disclosure. Every row links to its company and completes inline.
 */
export default async function TasksPage() {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_tasks")
    .select(
      "id, title, notes, due_at, priority, status, completed_at, reminder_at, account_id, assigned_user_id",
    )
    .eq("assigned_user_id", user.id)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(500);

  const rows = (data ?? []) as TaskRowData[];

  // Stitch in company names (manual join, matching the CRM's list convention).
  const accountIds = [
    ...new Set(rows.map((r) => r.account_id).filter(Boolean) as string[]),
  ];
  const { data: accs } = accountIds.length
    ? await supabase.from("crm_accounts").select("id, name").in("id", accountIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map(
    ((accs ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]),
  );

  const tasks: CrmTaskItem[] = rows.map((r) => ({
    ...r,
    companyName: r.account_id ? nameById.get(r.account_id) ?? null : null,
  }));

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const todayStart = startOfToday.getTime();
  const todayEnd = endOfToday.getTime();

  const openTasks = tasks.filter((t) => t.status !== "completed");
  const doneTasks = tasks.filter((t) => t.status === "completed");

  const overdue = openTasks.filter(
    (t) => t.due_at && new Date(t.due_at).getTime() < todayStart,
  );
  const dueToday = openTasks.filter((t) => {
    if (!t.due_at) return false;
    const ms = new Date(t.due_at).getTime();
    return ms >= todayStart && ms <= todayEnd;
  });
  const upcoming = openTasks.filter(
    (t) => !t.due_at || new Date(t.due_at).getTime() > todayEnd,
  );

  const openCount = openTasks.length;
  const hasAny = tasks.length > 0;

  return (
    <PageShell
      eyebrow="Follow-ups"
      title="Tasks"
      subtitle={
        openCount
          ? `${openCount} open ${openCount === 1 ? "task" : "tasks"} assigned to you`
          : "What's due, and what's next."
      }
    >
      {!hasAny ? (
        <Card>
          <EmptyState
            icon={<IconTasks />}
            title="No tasks yet"
            body="Add tasks from any company profile — call-backs, follow-ups, and next steps land here."
          />
        </Card>
      ) : (
        <>
          <Group title="Overdue" tasks={overdue} />
          <Group title="Due today" tasks={dueToday} />
          <Group title="Upcoming" tasks={upcoming} />

          {doneTasks.length > 0 && (
            <Card>
              <details>
                <summary className="cursor-pointer list-none border-b border-line px-5 py-3.5 text-[14px] font-semibold text-fg-subtle transition-colors hover:text-fg">
                  Done · {doneTasks.length}
                </summary>
                <ul className="divide-y divide-line">
                  {doneTasks.map((t) => (
                    <TaskRow key={t.id} task={t} showCompany />
                  ))}
                </ul>
              </details>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}

function Group({
  title,
  tasks,
}: {
  title: string;
  tasks: CrmTaskItem[];
}) {
  if (tasks.length === 0) return null;
  return (
    <Card>
      <CardHead title={title} hint={`${tasks.length}`} />
      <ul className="divide-y divide-line">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} showCompany />
        ))}
      </ul>
    </Card>
  );
}
