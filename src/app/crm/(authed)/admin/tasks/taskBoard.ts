import { taskDueBucket } from "@/lib/crm/taskUrgency";
import { initialsOf, timestampMs } from "../../_shell/format";
import { summarizeDue, UNASSIGNED_KEY, type DueCounts, type DueTaskRow } from "../dueReport";

/**
 * Admin -> Tasks: the board's column shape and every pure derivation over it.
 *
 * A PLAIN module — no React, no DB — same contract as dueReport.ts,
 * companies/companyRow.ts and workItem.ts. It reuses dueReport's DueTaskRow
 * and its counting rather than declaring a second task shape: the board and
 * Overview's readout are two views of the same query, and they must never
 * disagree about how many tasks someone has or how many are late.
 *
 * URGENCY comes from lib/crm/taskUrgency.ts, like everywhere else. Overdue
 * means an open task past its due date, full stop.
 */

export { UNASSIGNED_KEY };
// Re-exported so the board and its tests keep one import site while the
// implementation lives with the other display helpers.
export { initialsOf };

export type BoardColumn = {
  /** An assignee id, or UNASSIGNED_KEY. Also the drop target's id. */
  key: string;
  name: string;
  /** Two-letter avatar initials. Empty for the unassigned column, which
   * shows a label chip instead of a person. */
  initials: string;
  counts: DueCounts;
  /** Already ordered most-urgent-first — see sortByUrgency. */
  cards: DueTaskRow[];
};

/**
 * Rank for the card order Brent specified: overdue, then today, then later
 * this week, then everything else. Undated sorts with "the rest" — it is
 * work with no deadline, not work that is late.
 */
const BUCKET_RANK: Record<string, number> = {
  overdue: 0,
  today: 1,
  this_week: 2,
  later: 3,
  none: 4,
};

/**
 * Most urgent first, and STABLE: within a bucket the soonest due date wins,
 * then the title. Without the final tiebreak a column of same-day tasks
 * would reshuffle on every render, which on a drag-and-drop board reads as
 * the card having moved somewhere you didn't put it.
 */
export function sortByUrgency(cards: DueTaskRow[], now: Date = new Date()): DueTaskRow[] {
  return [...cards].sort((a, b) => {
    const ra = BUCKET_RANK[taskDueBucket(a.dueAt, now)] ?? 4;
    const rb = BUCKET_RANK[taskDueBucket(b.dueAt, now)] ?? 4;
    if (ra !== rb) return ra - rb;
    const am = timestampMs(a.dueAt);
    const bm = timestampMs(b.dueAt);
    if (am !== null && bm !== null && am !== bm) return am - bm;
    if (am === null && bm !== null) return 1;
    if (bm === null && am !== null) return -1;
    return a.title.localeCompare(b.title);
  });
}


/**
 * One column per person, UNASSIGNED FIRST.
 *
 * Unassigned leads because work with no owner is the thing this screen
 * exists to clear — it is the admin's inbox, not the leftovers.
 *
 * EVERY employee gets a column, including those with nothing (my call, not
 * Brent's — an empty column is information: it says who has room, and it is
 * a drop target you can aim at, which a hidden column is not). People after
 * the first column stay in name order rather than sorting by load, so a
 * column doesn't move out from under the cursor between two drags.
 *
 * Unlike Overview's readout, the unassigned column is ALWAYS rendered even
 * when empty — there it is a table row that would be noise at zero, here it
 * is where you drop something to un-assign it.
 *
 * A task owned by somebody no longer on the team lands in the unassigned
 * column rather than vanishing: an orphaned task still needs an owner.
 */
export function buildBoard(
  tasks: DueTaskRow[],
  people: { id: string; name: string }[],
  now: Date = new Date(),
): BoardColumn[] {
  const byKey = new Map<string, DueTaskRow[]>();
  byKey.set(UNASSIGNED_KEY, []);
  for (const p of people) byKey.set(p.id, []);

  for (const task of tasks) {
    const bucket = (task.assigneeId && byKey.get(task.assigneeId)) || byKey.get(UNASSIGNED_KEY)!;
    bucket.push(task);
  }

  const column = (key: string, name: string, initials: string): BoardColumn => {
    const cards = byKey.get(key) ?? [];
    return { key, name, initials, counts: summarizeDue(cards, now), cards: sortByUrgency(cards, now) };
  };

  return [
    column(UNASSIGNED_KEY, "Unassigned", ""),
    ...people.map((p) => column(p.id, p.name, initialsOf(p.name))),
  ];
}

/** The three numbers in the page header, across the WHOLE org — not the sum
 * of what a capped column happens to render. */
export function boardTotals(tasks: DueTaskRow[], now: Date = new Date()): DueCounts {
  return summarizeDue(tasks, now);
}

/**
 * Would this drop change anything?
 *
 * A card dropped back on its own column is a no-op, not a write — worth
 * checking on the client so an accidental drag doesn't cost a round trip and
 * a full revalidate.
 */
export function isRealMove(card: DueTaskRow, targetKey: string): boolean {
  const current = card.assigneeId ?? UNASSIGNED_KEY;
  return current !== targetKey;
}

/** UNASSIGNED_KEY back to what the server wants: a user id, or null. */
export function assigneeIdForColumn(key: string): string | null {
  return key === UNASSIGNED_KEY ? null : key;
}
