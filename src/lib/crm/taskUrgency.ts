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

/**
 * WEEKEND GRACE. The instant a task becomes overdue is the start of the most
 * recent WORKING day, Central — which is today on a weekday, and the
 * preceding Friday all through Saturday and Sunday.
 *
 * The boundary therefore stops advancing on Friday night and jumps to Monday
 * 00:00 Central. Friday-, Saturday- and Sunday-dated work reads "today" for
 * the whole weekend and turns overdue on Monday morning, which is when
 * somebody could first have acted on it. Nobody is behind on Saturday for
 * work nobody was here to do.
 *
 * It grants exactly one weekend of grace, not a blanket amnesty: on Saturday
 * the boundary is Friday midnight, so a THURSDAY-dated task is still overdue.
 * Work that was already late on Friday stays late.
 *
 * Brent, 2026-08-28, accepting the consequence: this is general, so the admin
 * overdue readout goes quiet at weekends too. That is the intended behaviour
 * and the admin view is deliberately NOT special-cased to preserve the old
 * numbers — two definitions of "overdue" is the bug this module exists to
 * prevent.
 */
export function overdueBoundaryMs(now?: Date): number {
  const { startMs } = centralDayRange(now);
  let ms = startMs;
  // At most two steps back (Sunday -> Friday), but bounded at 7 so a bad
  // clock can never spin here.
  for (let i = 0; i < 7; i += 1) {
    // startMs is Central midnight, which lands on the SAME calendar date in
    // UTC (Central is UTC-5/-6), so the UTC weekday is that Central day's.
    const weekday = new Date(ms).getUTCDay();
    if (weekday !== 0 && weekday !== 6) return ms;
    // Step into the middle of the previous Central day, then re-derive its
    // midnight — going back a flat 24h would drift across a DST change.
    ms = centralDayRange(new Date(ms - 12 * 60 * 60 * 1000)).startMs;
  }
  return startMs;
}

export function taskUrgencyBucket(dueAt: string | null | undefined, now?: Date): TaskUrgencyBucket {
  const ms = timestampMs(dueAt);
  if (ms === null) return "upcoming";
  const { endMs } = centralDayRange(now);
  if (ms < overdueBoundaryMs(now)) return "overdue";
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
  // The SAME boundary taskUrgencyBucket uses, weekend grace included. Reading
  // the two off different boundaries is what produced "3 days late" sitting
  // next to a bucket that said "today" — a task is late here if and only if
  // it is overdue there.
  const boundaryMs = overdueBoundaryMs(now);
  if (ms >= boundaryMs) return 0;
  // The MAGNITUDE stays calendar days, as documented above: on Monday a
  // Friday task is "3 days late", because it is. Grace moves when the count
  // starts, not how a day is counted.
  return Math.max(1, Math.ceil((boundaryMs - ms) / 86_400_000));
}
