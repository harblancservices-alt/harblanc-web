/**
 * Countdown goals — the editable financial targets shown on the Dashboard's
 * bottom panel (v2-architecture.md §3c pattern: DB-direct, isDemoMode()-
 * branched, matching recurring-expenses.ts/broker-profile.ts's precedent).
 * Row shape and pace math (lib/dispatch/countdown.ts's CountdownGoal) are
 * reused as-is from legacy rather than re-derived — same table
 * (countdown_goals), same fields.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import type { CountdownGoal } from "@/lib/dispatch/countdown";

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

type CountdownGoalRow = {
  id: string;
  label: string;
  subtitle: string | null;
  target_amount: number | string | null;
  target_date: string;
  created_at: string;
};

export async function listCountdownGoals(): Promise<CountdownGoal[]> {
  if (await isDemoMode()) return [];

  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("countdown_goals")
    .select("id, label, subtitle, target_amount, target_date, created_at")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<CountdownGoalRow[]>();

  return (data ?? []).map((g) => ({
    id: g.id,
    label: g.label,
    subtitle: g.subtitle ?? "",
    targetAmount: num(g.target_amount),
    targetDate: g.target_date,
    createdAt: g.created_at,
  }));
}
