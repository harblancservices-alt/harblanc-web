import { taskUrgencyBucket, daysLate } from "@/lib/crm/taskUrgency";
import { centralDayRange, centralDateKey, centralInputToIso, timestampMs } from "../_shell/format";

/**
 * Workspace → Tasks, the agent's planning board: the four buckets, the
 * bucketing rule, and the date a drop writes.
 *
 * A PLAIN module — no React, no DB — same contract as agent/agentWork.ts and
 * admin/tasks/taskBoard.ts.
 *
 * Overdue/today comes from lib/crm/taskUrgency.ts, unchanged: overdue means
 * an open task past the start of today, Central, everywhere in this CRM.
 * This file only splits "upcoming" into tomorrow / the rest, and answers the
 * inverse question a drag asks — "what due date puts a card in THIS column".
 */

export const PLAN_COLUMNS = ["inbox", "today", "tomorrow", "week"] as const;
export type PlanColumn = (typeof PLAN_COLUMNS)[number];

export const PLAN_LABEL: Record<PlanColumn, string> = {
  inbox: "Inbox",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
};

export const PLAN_HINT: Record<PlanColumn, string> = {
  inbox: "assigned to you, not planned yet",
  today: "overdue sits at the top",
  tomorrow: "",
  // Says "and later" out loud. The board has four columns and the CRM has
  // tasks due months out; rather than drop those or invent a fifth column,
  // they land here sorted last and each shows its explicit date, so the
  // column never claims a date it doesn't have.
  week: "the rest, and anything later",
};

export type PlanTask = {
  id: string;
  title: string;
  dueAt: string | null;
  accountId: string | null;
  companyName: string | null;
  /**
   * Where this task came from, shown under the company. crm_tasks.task_type
   * verbatim — see plan-data.ts for why that is the only provenance the
   * schema can actually answer.
   */
  provenance: string | null;
  /** Who to speak to at the company — crm_tasks.contact_id resolved. */
  contactName: string | null;
  /** True for crm_tasks.priority = 'high'. Collapsed to a boolean on purpose:
   * the card shows one quiet marker or nothing, never a three-way scale. */
  isHigh: boolean;
  /** The brief — crm_tasks.notes. Revealed on open, not on the face. */
  instructions: string | null;
  /** The outcome — crm_tasks.definition_of_done. Revealed on open. */
  definitionOfDone: string | null;
};

const DAY_MS = 86_400_000;

/**
 * INBOX IS "NO DUE DATE", not "unread". A task with no due_at is work
 * somebody handed over without deciding when it happens — which is exactly
 * the thing this board exists to let the agent decide.
 */
export function planColumnOf(task: PlanTask, now: Date = new Date()): PlanColumn {
  if (timestampMs(task.dueAt) === null) return "inbox";
  const urgency = taskUrgencyBucket(task.dueAt, now);
  // Overdue lands in TODAY on purpose. An overdue task is not history, it is
  // the most urgent thing you have today, and a column of its own would be a
  // place for it to be ignored.
  if (urgency === "overdue" || urgency === "today") return "today";
  return centralDateKey(task.dueAt) === dateKeyForOffset(1, now) ? "tomorrow" : "week";
}

/** The Central calendar date, `offset` days from today. Anchored at the
 * Central day start plus midday so a DST shift can't roll it a day. */
function dateKeyForOffset(offset: number, now: Date): string {
  const { startMs } = centralDayRange(now);
  const iso = new Date(startMs + offset * DAY_MS + DAY_MS / 2).toISOString();
  return centralDateKey(iso)!;
}

/**
 * THE INVERSE: the due date that puts a card in `column`.
 *
 * The invariant this has to hold is simple and testable — drop a card into a
 * column and it must appear in that column. planColumnOf(dueAtForColumn(c))
 * === c, which plan.test.ts asserts for all four.
 *
 * "This week" writes a week out rather than "Friday". Friday collides with
 * Tomorrow when today is Thursday, and is in the past by Saturday; a rolling
 * seven days is what "this week" already means everywhere else in this CRM
 * (DUE_SOON_DAYS in lib/crm/taskUrgency.ts) and never collides.
 *
 * Everything is stored at local MIDDAY, matching the task composer and
 * assignmentTask.ts — a timezone shift can then never roll a due date onto
 * the wrong day.
 */
export function dueAtForColumn(column: PlanColumn, now: Date = new Date()): string | null {
  if (column === "inbox") return null;
  const offset = column === "today" ? 0 : column === "tomorrow" ? 1 : 7;
  return centralInputToIso(`${dateKeyForOffset(offset, now)}T12:00`);
}

/** The `<input type="date">` value for a column — used by the "+" composer so
 * a task created into a column lands in it. */
export function dueDateInputForColumn(column: PlanColumn, now: Date = new Date()): string {
  if (column === "inbox") return "";
  const offset = column === "today" ? 0 : column === "tomorrow" ? 1 : 7;
  return dateKeyForOffset(offset, now);
}

export type PlanBoard = Record<PlanColumn, PlanTask[]>;

/**
 * Split into the four columns, each ordered the way that column is read.
 *
 * Today leads with the most overdue and works forward. The others are
 * soonest-first. Ties break on title so a column can't reshuffle between
 * renders — on a drag-and-drop board that reads as the card having moved on
 * its own.
 */
export function buildPlanBoard(tasks: PlanTask[], now: Date = new Date()): PlanBoard {
  const board: PlanBoard = { inbox: [], today: [], tomorrow: [], week: [] };
  for (const task of tasks) board[planColumnOf(task, now)].push(task);

  const byDue = (a: PlanTask, b: PlanTask) => {
    const am = timestampMs(a.dueAt);
    const bm = timestampMs(b.dueAt);
    if (am !== null && bm !== null && am !== bm) return am - bm;
    return a.title.localeCompare(b.title);
  };
  board.inbox.sort((a, b) => a.title.localeCompare(b.title));
  board.today.sort(byDue);
  board.tomorrow.sort(byDue);
  board.week.sort(byDue);
  return board;
}

/** What the card's right-hand pill says. */
export function planCardLabel(task: PlanTask, now: Date = new Date()): string | null {
  if (timestampMs(task.dueAt) === null) return null;
  const urgency = taskUrgencyBucket(task.dueAt, now);
  if (urgency === "overdue") {
    const late = daysLate(task.dueAt, now);
    return late === 1 ? "1 day late" : `${late} days late`;
  }
  if (urgency === "today") return "today";
  const key = centralDateKey(task.dueAt)!;
  if (key === dateKeyForOffset(1, now)) return "tomorrow";
  const ms = timestampMs(task.dueAt)!;
  const { endMs } = centralDayRange(now);
  // Inside the week a weekday reads faster than a date; past it, only the
  // date is honest — this is the "and later" tail of the fourth column.
  return new Date(ms).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    ...(ms <= endMs + 7 * DAY_MS
      ? { weekday: "short" as const }
      : { month: "short" as const, day: "numeric" as const }),
  });
}

/** True when the card wears the red left edge. */
export function isOverdue(task: PlanTask, now: Date = new Date()): boolean {
  return timestampMs(task.dueAt) !== null && taskUrgencyBucket(task.dueAt, now) === "overdue";
}

/** A drop that changes nothing is not worth a write. */
export function isRealPlanMove(task: PlanTask, target: PlanColumn, now: Date = new Date()): boolean {
  return planColumnOf(task, now) !== target;
}
