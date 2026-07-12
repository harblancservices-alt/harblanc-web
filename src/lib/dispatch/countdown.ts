/**
 * Countdown-goal pace math.
 *
 * Pure functions — NO money math here (that stays in fuel.ts). This file only
 * turns a goal + two already-computed load aggregates (average net per load,
 * recent weekly net pace) into the read-only breakdown the dashboard shows:
 * days/weeks left, required pace, loads needed, and the on-pace verdict.
 *
 * All dates are handled as calendar days in local time via `YYYY-MM-DD`
 * strings, so "days left" ticks down by date and never drifts by a few hours.
 */

export type CountdownGoal = {
  id: string;
  label: string;
  subtitle: string;
  targetAmount: number;
  /** `YYYY-MM-DD` */
  targetDate: string;
  /** When the goal was created — the start of the time-progress bar. ISO. */
  createdAt: string;
};

/** Load aggregates over the recent window, from the canonical loadNet math. */
export type NetPace = {
  /** Mean net across delivered loads in the window. 0 if none. */
  avgNetPerLoad: number;
  /** Total window net ÷ window length in weeks — the recent weekly pace. */
  weeklyNetPace: number;
};

export type CountdownBreakdown = {
  daysLeft: number;
  weeksLeft: number;
  /** amount ÷ weeks-left (weeks-left floored at 1 so it never divides by 0). */
  perWeek: number;
  /** amount ÷ days-left (days-left floored at 1). */
  perDay: number;
  /** amount ÷ avg-net-per-load, or null when there's no load history yet. */
  loadsNeeded: number | null;
  /** true = averaging at or above the required weekly pace. */
  onPace: boolean;
  /** Whether a verdict can be drawn (needs some recent pace to compare to). */
  hasPace: boolean;
};

/** Parse a `YYYY-MM-DD` into a local-midnight Date. */
function localDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * Whole calendar days from `todayIso` up to `targetIso` (positive when the
 * target is in the future). Both are `YYYY-MM-DD`; the diff is taken at local
 * midnight so it's exact regardless of the time of day.
 */
export function daysUntil(targetIso: string, todayIso: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const diff = localDay(targetIso).getTime() - localDay(todayIso).getTime();
  return Math.round(diff / MS_PER_DAY);
}

/**
 * The full read-only breakdown for one goal. `daysLeft`/`weeksLeft` are clamped
 * at 0 (a past-due goal reads "0 days left"); the pace denominators floor at 1
 * so the required per-week / per-day figures stay finite on the last day.
 */
export function computeBreakdown(
  goal: CountdownGoal,
  pace: NetPace,
  todayIso: string,
): CountdownBreakdown {
  const rawDays = daysUntil(goal.targetDate, todayIso);
  const daysLeft = Math.max(0, rawDays);
  const weeksLeft = Math.max(0, Math.ceil(daysLeft / 7));

  const perWeek = goal.targetAmount / Math.max(1, weeksLeft);
  const perDay = goal.targetAmount / Math.max(1, daysLeft);

  const loadsNeeded =
    pace.avgNetPerLoad > 0
      ? Math.ceil(goal.targetAmount / pace.avgNetPerLoad)
      : null;

  const hasPace = pace.weeklyNetPace > 0;
  const onPace = hasPace && pace.weeklyNetPace >= perWeek;

  return { daysLeft, weeksLeft, perWeek, perDay, loadsNeeded, onPace, hasPace };
}

/**
 * Time-elapsed progress toward the deadline, 0–100:
 *   (today − created) / (target − created), clamped.
 * A zero/negative span (created on or after the target) reads as 100%. Both the
 * created timestamp and the dates collapse to calendar days so the bar advances
 * one notch per day, in step with the days-left count.
 */
export function timeProgressPct(goal: CountdownGoal, todayIso: string): number {
  const createdDay = goal.createdAt.slice(0, 10);
  const totalDays = daysUntil(goal.targetDate, createdDay);
  if (totalDays <= 0) return 100;
  const elapsed = daysUntil(todayIso, createdDay);
  return Math.max(0, Math.min(100, (elapsed / totalDays) * 100));
}
