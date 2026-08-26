import { centralDayRange, timestampMs } from "@/app/crm/(authed)/_shell/format";

/**
 * The shared overdue/today/upcoming bucketing for an OPEN task's due date —
 * unifies what used to be three independent inline re-implementations of the
 * same Central-day-boundary check (CRM_URGENCY_AUDIT.md §2): tasks/page.tsx's
 * Group filters, the dashboard's taskDueBucket, and TaskRow.tsx's
 * urgencyBucket. All three now call this instead of hand-rolling their own
 * `ms < todayStart` comparison, so a future change to the urgency window only
 * has one place to edit.
 *
 * A task with no due date reads as "upcoming" — same as a far-future one —
 * matching every caller's prior behavior.
 */
export type TaskUrgencyBucket = "overdue" | "today" | "upcoming";

export function taskUrgencyBucket(dueAt: string | null | undefined, now?: Date): TaskUrgencyBucket {
  const ms = timestampMs(dueAt);
  if (ms === null) return "upcoming";
  const { startMs, endMs } = centralDayRange(now);
  if (ms < startMs) return "overdue";
  if (ms <= endMs) return "today";
  return "upcoming";
}

/**
 * The WIDER due-date vocabulary, used by the two screens that report on work
 * rather than just colour one row: Admin -> Overview's per-agent due/overdue
 * readout and the agent dashboard's grouped work list.
 *
 * Deliberately built ON TOP of taskUrgencyBucket rather than beside it, so
 * "overdue" and "today" can never mean two different things in this CRM.
 * Overdue means exactly one thing everywhere: an OPEN task whose due_at is
 * before the start of today, Central. This function only adds resolution to
 * the far side of today.
 *
 * "this_week" is the next DUE_SOON_DAYS days rather than "before Sunday" —
 * a rolling window keeps the group useful on a Friday, where a
 * calendar-week reading would show almost nothing.
 *
 * A task with no due date is its OWN bucket here ("none"), unlike
 * taskUrgencyBucket where it folds into "upcoming". A pile of undated tasks
 * is a real management problem and the admin readout has to be able to
 * name it.
 */
export type TaskDueBucket = "overdue" | "today" | "this_week" | "later" | "none";

/** The rolling window "this week" means. Seven days, not to end-of-week. */
export const DUE_SOON_DAYS = 7;

export function taskDueBucket(dueAt: string | null | undefined, now?: Date): TaskDueBucket {
  const ms = timestampMs(dueAt);
  if (ms === null) return "none";
  const urgency = taskUrgencyBucket(dueAt, now);
  if (urgency !== "upcoming") return urgency;
  const { endMs } = centralDayRange(now);
  return ms <= endMs + DUE_SOON_DAYS * 86_400_000 ? "this_week" : "later";
}

/**
 * Whole days a task is late — 1 for a task due yesterday, 0 for one due
 * today or later. Counted in CENTRAL CALENDAR DAYS off the same day
 * boundary taskUrgencyBucket uses, not in elapsed hours: a task due at
 * 11pm yesterday is "1 day late" at 8am today, not "9 hours late".
 */
export function daysLate(dueAt: string | null | undefined, now?: Date): number {
  const ms = timestampMs(dueAt);
  if (ms === null) return 0;
  const { startMs } = centralDayRange(now);
  if (ms >= startMs) return 0;
  return Math.max(1, Math.ceil((startMs - ms) / 86_400_000));
}
