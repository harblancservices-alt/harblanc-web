import { getAssignBoardData } from "./assign-data";
import { listQuickTasks } from "./quick-task-actions";
import { AssignBoard } from "./AssignBoard";

export const dynamic = "force-dynamic";

/**
 * Admin → Overview — the assignment board.
 *
 * REPLACED the old landing summary (2026-08-25, Brent's call). That page was
 * six stat tiles and a paragraph explaining what the other tabs were for: it
 * reported, and an owner standing in front of it still had to go somewhere
 * else to actually do anything. This page has one job — handing work out to
 * the people who can do it.
 *
 * Deliberately NOT a dashboard: no metric tiles, no activity feed, no
 * past-due panel, no per-person performance number. The only number next to a
 * person is their current load, and it answers "who has room".
 */
export default async function AdminOverviewPage() {
  const [{ items, team, now }, quickTasks] = await Promise.all([
    getAssignBoardData(),
    listQuickTasks(),
  ]);
  return <AssignBoard items={items} team={team} now={now} quickTasks={quickTasks} />;
}
