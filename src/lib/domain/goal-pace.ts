/**
 * Single-goal countdown math (Phase 5D) — a concrete dated target + pace
 * verdict off the existing dispatch_settings.monthly_net_goal column
 * (editable via Settings since Phase 5A). Deliberately NOT a port of V1's
 * multi-goal CountdownCards engine (weekly pace, avg-net-per-load, custom
 * goals) — the phase brief calls for "a fast win... with multi-goal support
 * explicitly deferred," so this is new, small, and self-contained rather
 * than a duplicate of that larger engine. Reuses
 * src/lib/dispatch/goal-month.ts's business-timezone day math (the same
 * source V1's own goal bar uses) rather than re-deriving "today"/"days
 * left" a third time.
 *
 * Pure, no I/O — the caller supplies goal/net (already computed by the one
 * money engine) and the current instant.
 */

import { daysLeftInMonth, currentBusinessDate } from "@/lib/dispatch/goal-month";

export type GoalPaceVerdict = "met" | "on-pace" | "behind";

export type GoalPace = {
  goal: number;
  net: number;
  /** goal - net, floored at 0. */
  remaining: number;
  /** Days left in the current month, including today. */
  daysLeft: number;
  /** $/day still needed to close the gap over daysLeft. Null once met. */
  neededPerDay: number | null;
  /** Linear projection of this month's net if the pace-so-far holds. */
  projectedNet: number;
  verdict: GoalPaceVerdict;
};

export function computeGoalPace(goal: number, net: number, now: Date = new Date()): GoalPace {
  const daysLeft = daysLeftInMonth(now);
  const remaining = Math.max(0, goal - net);

  if (goal <= 0 || net >= goal) {
    return { goal, net, remaining: 0, daysLeft, neededPerDay: null, projectedNet: net, verdict: "met" };
  }

  const dayOfMonth = Number(currentBusinessDate(now).slice(8, 10)) || 1;
  const perDaySoFar = net / dayOfMonth;
  const projectedNet = net + perDaySoFar * daysLeft;
  const neededPerDay = daysLeft > 0 ? remaining / daysLeft : remaining;

  return {
    goal,
    net,
    remaining,
    daysLeft,
    neededPerDay,
    projectedNet,
    verdict: projectedNet >= goal ? "on-pace" : "behind",
  };
}
