/**
 * The one shared net-vs-goal pace calculator (audit:
 * docs/portal/expenses-performance-audit.md §H). A prior version of this
 * module existed, was deleted during the Today/Dashboard rework, and never
 * replaced — leaving Performance with a bare percent bar and legacy /admin
 * with a demonstrable bug: it computed "required per week" via
 * `Math.ceil(daysLeft / 7)` weeks and "required per day" separately, so the
 * two figures could visibly contradict each other on the same screen
 * (e.g. "$6,000/wk" next to a sentence implying "$1,200/day", where
 * $1,200 × 7 = $8,400 ≠ $6,000).
 *
 * This version has exactly one rule that prevents that class of bug:
 * requiredWeeklyPace is ALWAYS requiredDailyPace × 7 — derived, never
 * separately rounded or recomputed. Every surface that shows a monthly net
 * goal (Performance's goal card, Today's dashboard widget) consumes this
 * one function — never a second, page-local pace calculation.
 */

export type GoalPaceVerdict = "met" | "ahead" | "on-pace" | "behind";

export type GoalPace = {
  goal: number;
  currentNet: number;
  /** max(0, goal - currentNet) — 0 once the goal is met. */
  remaining: number;
  daysRemaining: number;
  weeksRemaining: number;
  /** remaining ÷ daysRemaining — 0 once the goal is met. */
  requiredDailyPace: number;
  /** requiredDailyPace × 7 — derived, never independently computed. */
  requiredWeeklyPace: number;
  /** currentNet ÷ daysElapsed — what the average day has produced so far. */
  currentAvgPace: number;
  /** currentNet + currentAvgPace × daysRemaining — where today's pace ends the period. */
  projectedResult: number;
  verdict: GoalPaceVerdict;
};

/** Comfortably-ahead threshold — projecting 2%+ over goal reads as "ahead"
 * rather than a borderline "on-pace" a single good/bad day could flip. */
const AHEAD_MARGIN = 1.02;

export function computeGoalPace(params: {
  goal: number;
  currentNet: number;
  /** Days so far in the period, including today (>= 1). */
  daysElapsed: number;
  /** Days left in the period, including today (>= 1) — e.g. daysLeftInMonth(). */
  daysRemaining: number;
}): GoalPace {
  const { goal, currentNet } = params;
  const daysElapsed = Math.max(1, params.daysElapsed);
  const daysRemaining = Math.max(1, params.daysRemaining);

  const met = goal > 0 && currentNet >= goal;
  const remaining = Math.max(0, goal - currentNet);
  const requiredDailyPace = met ? 0 : remaining / daysRemaining;
  const requiredWeeklyPace = requiredDailyPace * 7;
  const weeksRemaining = daysRemaining / 7;
  const currentAvgPace = currentNet / daysElapsed;
  const projectedResult = currentNet + currentAvgPace * daysRemaining;

  let verdict: GoalPaceVerdict;
  if (met) verdict = "met";
  else if (goal <= 0) verdict = "on-pace";
  else if (projectedResult >= goal * AHEAD_MARGIN) verdict = "ahead";
  else if (projectedResult >= goal) verdict = "on-pace";
  else verdict = "behind";

  return {
    goal,
    currentNet,
    remaining,
    daysRemaining,
    weeksRemaining,
    requiredDailyPace,
    requiredWeeklyPace,
    currentAvgPace,
    projectedResult,
    verdict,
  };
}
