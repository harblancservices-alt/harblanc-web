import { requireCrmUser } from "@/lib/crm/auth";
import { getPlanData } from "./plan-data";
import { TasksHub } from "./TasksHub";

export const dynamic = "force-dynamic";

/**
 * Workspace → Tasks — the agent's planning board, for everybody.
 *
 * Four columns: Inbox (assigned to you, no date yet), Today, Tomorrow, This
 * week. Dragging a card between them writes crm_tasks.due_at; ticking the
 * circle completes it. Both go through ./actions.ts, the one module that owns
 * crm_tasks writes.
 *
 * REPLACED the org-wide grouped list that lived here (Brent, 2026-08-25).
 * That view is not gone — it is Admin → Tasks, one column per person and
 * draggable between them, which is where an org-wide read belongs. An agent's
 * Tasks page should be their own work.
 *
 * The old page carried #overdue / #due-today anchors, which the command
 * centre's counter tiles still link to. Those links now land on this board
 * with nothing to scroll to — harmless, since overdue sits at the top of
 * Today either way, and the command centre is itself unlinked from the nav.
 *
 * NO ROLE SPLIT, same as Dashboard: an owner opening Tasks plans their own
 * queue exactly as an agent does.
 */
export default async function TasksPage() {
  const user = await requireCrmUser();
  const { tasks, companies, completeness, doneThisWeek, now } = await getPlanData(user);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-6">
      <TasksHub
        tasks={tasks}
        companies={companies}
        completeness={completeness}
        now={now}
        doneThisWeek={doneThisWeek}
      />
    </div>
  );
}
