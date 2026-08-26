import { taskDueBucket, daysLate } from "@/lib/crm/taskUrgency";
import { timestampMs } from "../_shell/format";

/**
 * Admin -> Overview's due-date readout: the row shape and every pure
 * derivation over it. A PLAIN module — no React, no DB — same contract as
 * workItem.ts and companies/companyRow.ts.
 *
 * OVERDUE MEANS ONE THING (Brent, 2026-08-25): an open task whose due_at is
 * before the start of today, Central. Nothing here re-decides that — the
 * bucketing is lib/crm/taskUrgency.ts's taskDueBucket, the same function the
 * agent dashboard groups by and the same day boundary the global Tasks page
 * and every task row's colour already use. This file only tallies.
 *
 * The old Overview reported "attention counts" pulled from status
 * vocabularies (OTR entries in `new`, BOL entries in `needs_review`, and so
 * on). Those are pipeline states, not deadlines: a thing could sit in one
 * forever without ever being late, and nothing on the screen said who owed
 * it or when. This replaces that half of the page entirely.
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
  /** Open tasks with no due_at at all — a real management problem, so it
   * gets its own column instead of hiding inside "later". */
  none: number;
  total: number;
};

export type DueReportRow = {
  /** An assignee id, or UNASSIGNED_KEY. */
  key: string;
  name: string;
  counts: DueCounts;
};

/** Row key for open tasks nobody owns. Not a real user id. */
export const UNASSIGNED_KEY = "__unassigned__";

export function emptyCounts(): DueCounts {
  return { overdue: 0, today: 0, thisWeek: 0, later: 0, none: 0, total: 0 };
}

function add(counts: DueCounts, dueAt: string | null, now: Date): void {
  counts.total += 1;
  switch (taskDueBucket(dueAt, now)) {
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

export function summarizeDue(tasks: DueTaskRow[], now: Date = new Date()): DueCounts {
  const counts = emptyCounts();
  for (const t of tasks) add(counts, t.dueAt, now);
  return counts;
}

/**
 * One row per person, plus the unassigned pile.
 *
 * Everybody on the team gets a row even at zero — "nobody has given Brent
 * anything" is information, the same reasoning Admin -> Companies uses for
 * its per-agent filters. The unassigned pile is PINNED FIRST when it isn't
 * empty: it is the admin's own inbox and the one row on this table they can
 * act on directly.
 *
 * A task assigned to somebody who is no longer on the team would otherwise
 * vanish from the totals, so it lands in the unassigned pile rather than
 * being dropped — an orphaned task still needs an owner.
 */
export function reportByAssignee(
  tasks: DueTaskRow[],
  people: { id: string; name: string }[],
  now: Date = new Date(),
): DueReportRow[] {
  const byKey = new Map<string, DueReportRow>();
  byKey.set(UNASSIGNED_KEY, { key: UNASSIGNED_KEY, name: "Nobody yet", counts: emptyCounts() });
  for (const p of people) byKey.set(p.id, { key: p.id, name: p.name, counts: emptyCounts() });

  for (const t of tasks) {
    const row = (t.assigneeId && byKey.get(t.assigneeId)) || byKey.get(UNASSIGNED_KEY)!;
    add(row.counts, t.dueAt, now);
  }

  const unassigned = byKey.get(UNASSIGNED_KEY)!;
  const rest = [...byKey.values()]
    .filter((r) => r.key !== UNASSIGNED_KEY)
    // Most behind first — the readout exists to find who is underwater, and
    // a name that never moves off the top of an alphabetical list buries it.
    .sort((a, b) => {
      if (a.counts.overdue !== b.counts.overdue) return b.counts.overdue - a.counts.overdue;
      if (a.counts.today !== b.counts.today) return b.counts.today - a.counts.today;
      return a.name.localeCompare(b.name);
    });

  return unassigned.counts.total > 0 ? [unassigned, ...rest] : rest;
}

/**
 * The most-overdue open tasks, worst first. Turns the overdue COLUMN into
 * something an admin can act on: which task, whose, and how far behind.
 */
export function longestOverdue(
  tasks: DueTaskRow[],
  now: Date = new Date(),
  limit = 6,
): DueTaskRow[] {
  return tasks
    .filter((t) => taskDueBucket(t.dueAt, now) === "overdue")
    .sort((a, b) => {
      const am = timestampMs(a.dueAt) ?? 0;
      const bm = timestampMs(b.dueAt) ?? 0;
      if (am !== bm) return am - bm;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}

/** "4 days late" / "1 day late" for an overdue row. Shares daysLate with the
 * agent dashboard so the two screens can't quote different numbers for the
 * same task. */
export function lateLabel(dueAt: string | null, now: Date = new Date()): string {
  const late = daysLate(dueAt, now);
  return late === 1 ? "1 day late" : `${late} days late`;
}
