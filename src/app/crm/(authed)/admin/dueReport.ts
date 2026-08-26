import { taskDueBucket } from "@/lib/crm/taskUrgency";

/**
 * The open-task row shape and the counting over it, shared by Admin → Tasks'
 * board and the data reader that feeds it (due-data.ts). A PLAIN module — no
 * React, no DB — same contract as workItem.ts and companies/companyRow.ts.
 *
 * OVERDUE MEANS ONE THING (Brent, 2026-08-25): an open task whose due_at is
 * before the start of today, Central. Nothing here re-decides that — the
 * bucketing is lib/crm/taskUrgency.ts's taskDueBucket, the same function the
 * agent dashboard groups by and the same day boundary the global Tasks page
 * and every task row's colour already use. This file only tallies.
 *
 * WAS BIGGER. It also carried Admin → Overview's "Where the work stands"
 * readout (reportByAssignee, longestOverdue, lateLabel). Brent removed that
 * section on 2026-08-25 and those three went with it rather than being left
 * as dead code — Admin → Tasks reports the same numbers off the same query
 * and lets you act on them.
 */

export type DueTaskRow = {
  id: string;
  title: string;
  dueAt: string | null;
  /** crm_tasks.assigned_user_id, or null for the unassigned pile. */
  assigneeId: string | null;
  accountId: string | null;
  companyName: string | null;
};

export type DueCounts = {
  overdue: number;
  today: number;
  thisWeek: number;
  later: number;
  /** Open tasks with no due_at at all — counted separately rather than
   * hidden inside "later", because work that can never come due is its own
   * management problem. */
  none: number;
  total: number;
};

/** Column key for open tasks nobody owns. Not a real user id — the Tasks
 * board maps it back to a null owner (tasks/taskBoard.ts). */
export const UNASSIGNED_KEY = "__unassigned__";

/** Private since 2026-08-25: reportByAssignee was its only outside caller
 * and left with the Overview readout. */
function emptyCounts(): DueCounts {
  return { overdue: 0, today: 0, thisWeek: 0, later: 0, none: 0, total: 0 };
}

export function summarizeDue(tasks: DueTaskRow[], now: Date = new Date()): DueCounts {
  const counts = emptyCounts();
  for (const task of tasks) {
    counts.total += 1;
    switch (taskDueBucket(task.dueAt, now)) {
      case "overdue":
        counts.overdue += 1;
        break;
      case "today":
        counts.today += 1;
        break;
      case "this_week":
        counts.thisWeek += 1;
        break;
      case "later":
        counts.later += 1;
        break;
      default:
        counts.none += 1;
    }
  }
  return counts;
}
