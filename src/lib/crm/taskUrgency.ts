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
