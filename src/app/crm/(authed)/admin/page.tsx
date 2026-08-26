import { getAssignBoardData } from "./assign-data";
import { getOpenTasksForReport } from "./due-data";
import { listQuickTasks } from "./quick-task-actions";
import { AssignBoard } from "./AssignBoard";
import { DueReportPanel } from "./DueReportPanel";

export const dynamic = "force-dynamic";

/**
 * Admin → Overview — two halves, in the order an owner actually uses them.
 *
 * TOP: where the work stands. Every open task in the org, counted per person
 * against its DUE DATE — overdue, today, this week, later, undated — plus the
 * pile nobody owns and the tasks furthest behind. "Overdue" means one thing
 * here and everywhere else in the CRM: an open task past its due date (Brent,
 * 2026-08-25). It is computed by lib/crm/taskUrgency.ts, the same module the
 * agent dashboard, the global Tasks page and every task row's colour read.
 *
 * BOTTOM: the assignment board, unchanged — the one screen for handing work
 * out to the people who can do it.
 *
 * Still deliberately NOT a general dashboard: no activity feed, no per-person
 * performance number, no vanity metric. Every number on this page is either a
 * deadline someone missed or a load that answers "who has room".
 */
export default async function AdminOverviewPage() {
  const [{ items, team, now }, openTasks, quickTasks] = await Promise.all([
    getAssignBoardData(),
    getOpenTasksForReport(),
    listQuickTasks(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <DueReportPanel tasks={openTasks} team={team} now={now} />
      <AssignBoard items={items} team={team} now={now} quickTasks={quickTasks} />
    </div>
  );
}
