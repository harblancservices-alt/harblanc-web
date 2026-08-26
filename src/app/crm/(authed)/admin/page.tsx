import { getAssignBoardData } from "./assign-data";
import { listQuickTasks } from "./quick-task-actions";
import { AssignBoard } from "./AssignBoard";

export const dynamic = "force-dynamic";

/**
 * Admin → Overview — the assignment board.
 *
 * ONE job: handing work out to the people who can do it.
 *
 * A "Where the work stands" readout briefly sat above this (per-person
 * overdue/today/this-week counts off crm_tasks.due_at). Brent removed it
 * 2026-08-25. Nothing was lost: Admin → Tasks reports the same numbers from
 * the same query and lets you act on them, so the readout was a second view
 * of one dataset sitting on top of an unrelated screen. Its panel and the
 * three pure helpers only it used (reportByAssignee, longestOverdue,
 * lateLabel) were deleted rather than left as dead code; dueReport.ts stays
 * for the row shape and counting the Tasks board still reads.
 *
 * Deliberately NOT a dashboard: no metric tiles, no activity feed, no
 * per-person performance number. The only number next to a person is their
 * current load, and it answers "who has room".
 */
export default async function AdminOverviewPage() {
  const [{ items, team, contacts, now }, quickTasks] = await Promise.all([
    getAssignBoardData(),
    listQuickTasks(),
  ]);

  return <AssignBoard items={items} team={team} contacts={contacts} now={now} quickTasks={quickTasks} />;
}
